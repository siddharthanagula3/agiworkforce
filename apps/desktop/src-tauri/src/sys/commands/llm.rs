use crate::core::llm::providers::{
    direct_api_provider::DirectApiProvider, managed_cloud_provider::ManagedCloudProvider,
    ollama::OllamaProvider,
};
use crate::core::llm::{
    cache_manager::CacheManager,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    ChatMessage, LLMRequest, LLMResponse, LLMRouter, Provider,
};
use crate::sys::commands::chat::AppDatabase;
use crate::sys::security::rate_limit::{RateLimitConfig, RateLimiter};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::RwLock;

use crate::core::llm::OLLAMA_DEFAULT_BASE_URL;

const DEFAULT_MODEL: &str = "gpt-5-nano";

/// Managed state holding rate limiters for LLM and MCP tool execution.
///
/// `RateLimiter` uses `parking_lot::Mutex` internally, so it is already
/// `Send + Sync` and safe to share across async Tauri command handlers
/// without an additional `Arc<Mutex<>>` wrapper.
pub struct RateLimitState {
    /// Rate limiter for LLM message requests (30 requests per 60 seconds).
    pub llm_limiter: RateLimiter,
    /// Rate limiter for MCP tool executions (60 requests per 60 seconds).
    pub mcp_limiter: RateLimiter,
}

impl Default for RateLimitState {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimitState {
    pub fn new() -> Self {
        Self {
            llm_limiter: RateLimiter::new(RateLimitConfig {
                max_requests: 30,
                window: Duration::from_secs(60),
            }),
            mcp_limiter: RateLimiter::new(RateLimitConfig {
                max_requests: 60,
                window: Duration::from_secs(60),
            }),
        }
    }
}

/// Resolves a provider string to the appropriate Provider enum for routing.
///
/// Preserves the actual provider so that BYOK (direct API key) providers
/// can be matched when registered via `llm_configure_provider`. The router
/// will fall back to ManagedCloud automatically when the specific provider
/// is not registered.
fn resolve_provider_for_routing(s: &str) -> Option<Provider> {
    Provider::from_string(s)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMSendMessageRequest {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub prefer_cloud_credits: bool, // Prefer cloud credits over own API keys
}

pub struct LLMState {
    pub router: Arc<RwLock<LLMRouter>>,
    pub cache_manager: CacheManager,
}

#[derive(Debug, Serialize)]
pub struct RouterSuggestionPayload {
    pub provider: String,
    pub model: String,
    pub reason: String,
}

impl Default for LLMState {
    fn default() -> Self {
        Self::new()
    }
}

impl LLMState {
    pub fn new() -> Self {
        Self {
            router: Arc::new(RwLock::new(LLMRouter::new())),
            cache_manager: CacheManager::new(Duration::from_secs(60 * 60 * 24), 512),
        }
    }
}

#[tauri::command]
pub async fn llm_send_message(
    request: LLMSendMessageRequest,
    state: State<'_, LLMState>,
    rate_limit_state: State<'_, RateLimitState>,
) -> Result<LLMResponse, String> {
    // Rate limit check: 30 requests per minute per user session.
    // Uses "llm" as the global key since all LLM requests share the same budget.
    rate_limit_state
        .llm_limiter
        .check_rate_limit("llm")
        .map_err(|_| {
            "[ERR_RATE_LIMIT] You are sending messages too quickly. Please wait a moment and try again (limit: 30 requests per minute).".to_string()
        })?;

    if request.messages.is_empty() {
        return Err("Messages array cannot be empty".to_string());
    }
    if request.messages.len() > 1000 {
        return Err(format!(
            "Too many messages: {}. Maximum is 1000",
            request.messages.len()
        ));
    }

    if let Some(temp) = request.temperature {
        if !(0.0..=2.0).contains(&temp) {
            return Err(format!(
                "Invalid temperature: {}. Must be between 0.0 and 2.0",
                temp
            ));
        }
    }

    if let Some(max_tokens) = request.max_tokens {
        if max_tokens == 0 {
            return Err("max_tokens must be greater than 0".to_string());
        }
        if max_tokens > 1_000_000 {
            return Err(format!(
                "max_tokens too large: {}. Maximum is 1,000,000",
                max_tokens
            ));
        }
    }

    // Pre-flight authentication check for cloud credits.
    // Only require auth when user explicitly requests ManagedCloud or prefers cloud credits.
    // BYOK providers (OpenAI, Anthropic, etc.) with user-supplied API keys do not need auth.
    let is_managed_cloud_request = request
        .provider
        .as_ref()
        .map(|p| {
            Provider::from_string(p)
                .map(|provider| provider == Provider::ManagedCloud)
                .unwrap_or(false)
        })
        .unwrap_or(false);

    if request.prefer_cloud_credits || is_managed_cloud_request {
        use crate::sys::account::get_access_token;
        if get_access_token().is_err() {
            return Err(
                "[ERR_AUTH_REQUIRED] Please sign in to use cloud credits. Your session may have expired.".to_string()
            );
        }
    }

    let provider_name = request.provider.clone();
    let provider = request
        .provider
        .as_deref()
        .and_then(resolve_provider_for_routing);

    let model = request
        .model
        .clone()
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let llm_request = LLMRequest {
        messages: request.messages,
        model: model.clone(),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    };

    let preferences = RouterPreferences {
        provider,
        model: request.model.clone(),
        strategy: RoutingStrategy::Auto,
        context: None,
        prefer_cloud_credits: request.prefer_cloud_credits,
    };

    let candidates = {
        let router = state.router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        // Fallback logic: If the requested provider (e.g. OpenAI) is not configured,
        // but Managed Cloud IS available, redirect to Managed Cloud.
        let router = state.router.read().await;
        let managed_cloud_available = router.has_provider(Provider::ManagedCloud);

        if let (true, Some(requested)) = (managed_cloud_available, provider_name.as_ref()) {
            tracing::info!(
                "Redirecting request for unconfigured provider '{}' to Managed Cloud",
                requested
            );

            // Create a fallback candidate for Managed Cloud
            // We use "managed-cloud-auto" or pass the requested model as a hint if compatible
            let fallback_candidate = crate::core::llm::llm_router::RouteCandidate {
                provider: Provider::ManagedCloud,
                model: request
                    .model
                    .clone()
                    .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
                reason: "fallback-redirect-to-managed-cloud",
                strategy: None,
            };

            // Need to drop the read lock before we can invoke (invoke might need locks internally?)
            // Actually `invoke_candidate` takes &self, so read lock is fine if we are careful.
            // But `candidates` variable assumes we dropped the lock?
            // In the original code:
            // let candidates = { let router = state.router.read().await; router.candidates(...) };
            // So the lock is dropped here. We need to re-acquire.

            // Since we can't easily append to `candidates` (it's immutable local var in valid scope, but empty),
            // let's just proceed with this fallback candidate.

            let res = router
                .invoke_candidate(&fallback_candidate, &llm_request)
                .await;

            match res {
                Ok(mut outcome) => {
                    outcome.response.cached = false;
                    return Ok(outcome.response);
                }
                Err(err) => {
                    let error_msg = err.to_string();
                    tracing::error!("Managed Cloud fallback failed: {}", error_msg);

                    if error_msg.contains("402")
                        || error_msg.contains("credit limit")
                        || error_msg.contains("quota")
                        || error_msg.contains("insufficient_quota")
                    {
                        return Err(format!(
                            "[ERR_BILLING_QUOTA] {}",
                            error_msg.replace("Network error: ", "")
                        ));
                    }
                    // Fall through to standard error handling
                }
            }
        }

        if let Some(name) = provider_name {
            return Err(format!(
                "Provider '{}' is not configured. Please sign in to use Managed Cloud.",
                name
            ));
        }
        return Err(
            "No LLM providers are configured. Please sign in to use Managed Cloud.".to_string(),
        );
    }

    let mut last_error: Option<anyhow::Error> = None;
    let mut error_messages: Vec<String> = Vec::new();

    for candidate in candidates {
        let res = {
            let router = state.router.read().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };
        match res {
            Ok(mut outcome) => {
                outcome.response.cached = false;
                return Ok(outcome.response);
            }
            Err(err) => {
                let error_msg = err.to_string();
                error_messages.push(format!("{}: {}", candidate.provider.as_string(), error_msg));

                // Map errors to standardized codes for frontend
                if error_msg.contains("402")
                    || error_msg.contains("credit limit")
                    || error_msg.contains("quota")
                    || error_msg.contains("insufficient_quota")
                {
                    return Err(format!(
                        "[ERR_BILLING_QUOTA] {}",
                        error_msg.replace("Network error: ", "")
                    ));
                }

                if error_msg.contains("401")
                    || error_msg.contains("Unauthorized")
                    || error_msg.contains("invalid_api_key")
                {
                    return Err(format!(
                        "[ERR_AUTH_INVALID] Authentication failed for {}. Please check your API key or sign in again.",
                        candidate.provider.as_string()
                    ));
                }

                if error_msg.contains("429") || error_msg.contains("rate limit") {
                    return Err(format!(
                        "[ERR_RATE_LIMIT] Rate limit exceeded for {}. Please try again later.",
                        candidate.provider.as_string()
                    ));
                }

                if error_msg.contains("decode")
                    || error_msg.contains("deserialize")
                    || error_msg.contains("JSON")
                {
                    return Err(format!(
                        "[ERR_PROVIDER_ERROR] Error decoding response from {}: {}. This may indicate an API issue.",
                        candidate.provider.as_string(),
                        error_msg
                    ));
                }

                if error_msg.contains("timeout") || error_msg.contains("timed out") {
                    return Err(format!(
                        "[ERR_NETWORK_TIMEOUT] Request timed out for {}. Please check your connection.",
                         candidate.provider.as_string()
                    ));
                }

                last_error = Some(err);
            }
        }
    }

    if let Some(err) = last_error {
        let mut error_text = format!(
            "All providers failed. Errors: {}",
            error_messages.join("; ")
        );
        let err_str = err.to_string();
        if !err_str.is_empty() {
            error_text = format!("{} Last error: {}", error_text, err_str);
        }
        return Err(error_text);
    }

    Err("All providers failed with unknown errors.".to_string())
}

#[tauri::command]
pub async fn llm_configure_provider(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    if provider.trim().is_empty() {
        return Err("Provider name cannot be empty".to_string());
    }

    let mut router = state.router.write().await;

    match provider.as_str() {
        "ollama" => {
            let ollama = OllamaProvider::new(base_url)
                .map_err(|e| format!("Failed to create Ollama provider: {}", e))?;
            router.set_ollama(Box::new(ollama));
            Ok(())
        }
        "managed_cloud" | "managedcloud" | "cloud" => {
            // ManagedCloud doesn't need an API key - it uses the access token from keyring
            let managed = ManagedCloudProvider::new()
                .map_err(|e| format!("Failed to create ManagedCloud provider: {}", e))?;
            router.set_managed_cloud(Box::new(managed));
            Ok(())
        }
        _ => {
            // BYOK: Create a DirectApiProvider for cloud providers with user-supplied API keys.
            let provider_enum = Provider::from_string(&provider)
                .ok_or_else(|| format!("Unknown provider: {}", provider))?;

            // Try the explicitly passed api_key first, then fall back to the
            // encrypted key stored in the MCP settings database.
            let resolved_key = api_key
                .filter(|k| !k.is_empty())
                .or_else(|| {
                    crate::sys::commands::mcp_oauth::retrieve_api_key(provider_enum.as_string())
                        .ok()
                })
                .ok_or_else(|| {
                    format!(
                        "No API key provided for '{}'. Please add your API key in Settings \u{2192} Models.",
                        provider
                    )
                })?;

            let direct = DirectApiProvider::new(provider_enum, resolved_key, base_url)
                .map_err(|e| format!("Failed to create {} provider: {}", provider, e))?;
            router.set_provider(provider_enum, Box::new(direct));

            tracing::info!(
                "Registered BYOK DirectApiProvider for '{}'",
                provider_enum.as_string()
            );
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn llm_set_default_provider(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    if provider.trim().is_empty() {
        return Err("Provider name cannot be empty".to_string());
    }

    let mut router = state.router.write().await;

    let provider_enum = resolve_provider_for_routing(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    router.set_default_provider(provider_enum);
    Ok(())
}

/// Auto-initialize ManagedCloud provider if user is authenticated
/// This ensures ManagedCloud is available for Pro/Max users who prefer cloud credits
#[tauri::command]
pub async fn llm_ensure_managed_cloud(state: State<'_, LLMState>) -> Result<bool, String> {
    use crate::sys::account::get_access_token;

    // Check if user has access token (is authenticated)
    match get_access_token() {
        Ok(_) => {
            // User is authenticated, register ManagedCloud provider
            match ManagedCloudProvider::new() {
                Ok(provider) => {
                    let mut router = state.router.write().await;
                    router.set_managed_cloud(Box::new(provider));
                    Ok(true)
                }
                Err(_) => Ok(false),
            }
        }
        Err(_) => {
            // User not authenticated, ManagedCloud won't be available
            Ok(false)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub provider: String,
    pub available: bool,
    pub configured: bool,
    pub error: Option<String>,
    pub rate_limit_remaining: Option<u32>,
    pub rate_limit_reset: Option<String>,
    pub ollama_running: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_tokens: u64,
    pub total_cost: f64,
    pub message_count: u64,
    pub by_provider: std::collections::HashMap<String, ProviderUsage>,
    pub by_model: std::collections::HashMap<String, ProviderUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUsage {
    pub tokens: u64,
    pub cost: f64,
    pub messages: u64,
}

#[tauri::command]
pub async fn llm_get_available_models(
    state: State<'_, LLMState>,
) -> Result<Vec<ModelInfo>, String> {
    let router = state.router.read().await;

    // Build model list from single-source-of-truth JSON catalog.
    // Filter out media models (image, video, tts, stt, music) -- those are not
    // chat models and shouldn't appear in the model selector.
    let config = crate::core::llm::models_config::config();
    let excluded_types = ["image", "video", "tts", "stt", "music"];
    let all_models: Vec<ModelInfo> = config
        .models
        .values()
        .filter(|m| !excluded_types.contains(&m.model_type.as_str()))
        .map(|m| ModelInfo {
            id: m.id.clone(),
            name: m.name.clone(),
            provider: m.provider.clone(),
            available: false,
        })
        .collect();

    let mut available_models = Vec::new();

    let managed_cloud_available = router.has_provider(Provider::ManagedCloud);

    for mut model in all_models {
        let provider_enum = match Provider::from_string(&model.provider) {
            Some(p) => p,
            None => continue,
        };

        if router.has_provider(provider_enum) || managed_cloud_available {
            model.available = true;
            available_models.push(model);
        }
    }

    if router.has_provider(Provider::Ollama) {
        match llm_list_ollama_models().await {
            Ok(ollama_models) => {
                // Only add Ollama models if we actually found some
                if !ollama_models.is_empty() {
                    available_models.extend(ollama_models);
                }
                // If Ollama is running but no models installed, don't show anything
            }
            Err(e) => {
                // Ollama server not running or not accessible - don't show fallback models
                tracing::debug!("Ollama not available: {}", e);
            }
        }
    }

    Ok(available_models)
}

#[tauri::command]
pub async fn llm_check_provider_status(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<ProviderStatus, String> {
    let router = state.router.read().await;

    let provider_enum = resolve_provider_for_routing(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    let managed_cloud_available = router.has_provider(Provider::ManagedCloud);
    let configured = match provider_enum {
        Provider::ManagedCloud => managed_cloud_available,
        Provider::Ollama => router.has_provider(Provider::Ollama),
        _ => router.has_provider(provider_enum),
    };

    let mut ollama_running = None;
    if provider == "ollama" {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
        match client
            .get(format!("{}/api/tags", OLLAMA_DEFAULT_BASE_URL))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            Ok(_) => {
                ollama_running = Some(true);
            }
            Err(_) => {
                ollama_running = Some(false);
            }
        }
    }

    let available = if provider == "ollama" {
        configured && ollama_running.unwrap_or(false)
    } else {
        configured
    };

    Ok(ProviderStatus {
        provider: provider.clone(),
        available,
        configured,
        error: if !configured && provider != "ollama" {
            Some("Provider not configured. Add your API key in Settings \u{2192} Models, or sign in to use Managed Cloud.".to_string())
        } else if provider == "ollama" && !ollama_running.unwrap_or(false) {
            Some("Ollama server is not running. Start with 'ollama serve'".to_string())
        } else {
            None
        },
        rate_limit_remaining: None,
        rate_limit_reset: None,
        ollama_running,
    })
}

#[tauri::command]
pub async fn llm_get_usage_stats(db: State<'_, AppDatabase>) -> Result<UsageStats, String> {
    let conn = db.connection()?;

    let (total_tokens, total_cost, message_count) = conn
        .query_row(
            "SELECT
            COALESCE(SUM(tokens), 0) as total_tokens,
            COALESCE(SUM(cost), 0.0) as total_cost,
            COUNT(*) as message_count
         FROM messages
         WHERE role = 'assistant'",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)? as u64,
                    row.get::<_, f64>(1)?,
                    row.get::<_, i64>(2)? as u64,
                ))
            },
        )
        .map_err(|e| format!("Failed to fetch total usage stats: {}", e))?;

    let mut by_provider = std::collections::HashMap::new();
    let mut stmt = conn
        .prepare(
            "SELECT
            COALESCE(provider, 'unknown') as provider,
            COALESCE(SUM(tokens), 0) as tokens,
            COALESCE(SUM(cost), 0.0) as cost,
            COUNT(*) as messages
         FROM messages
         WHERE role = 'assistant'
         GROUP BY provider",
        )
        .map_err(|e| format!("Failed to prepare provider stats query: {}", e))?;

    let provider_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                ProviderUsage {
                    tokens: row.get::<_, i64>(1)? as u64,
                    cost: row.get::<_, f64>(2)?,
                    messages: row.get::<_, i64>(3)? as u64,
                },
            ))
        })
        .map_err(|e| format!("Failed to query provider stats: {}", e))?;

    for (provider, usage) in provider_rows.flatten() {
        by_provider.insert(provider, usage);
    }

    let mut by_model = std::collections::HashMap::new();
    let mut stmt = conn
        .prepare(
            "SELECT
            COALESCE(model, 'unknown') as model,
            COALESCE(SUM(tokens), 0) as tokens,
            COALESCE(SUM(cost), 0.0) as cost,
            COUNT(*) as messages
         FROM messages
         WHERE role = 'assistant'
         GROUP BY model",
        )
        .map_err(|e| format!("Failed to prepare model stats query: {}", e))?;

    let model_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                ProviderUsage {
                    tokens: row.get::<_, i64>(1)? as u64,
                    cost: row.get::<_, f64>(2)?,
                    messages: row.get::<_, i64>(3)? as u64,
                },
            ))
        })
        .map_err(|e| format!("Failed to query model stats: {}", e))?;

    for (model, usage) in model_rows.flatten() {
        by_model.insert(model, usage);
    }

    Ok(UsageStats {
        total_tokens,
        total_cost,
        message_count,
        by_provider,
        by_model,
    })
}

// Internal types for llm_list_ollama_models (public types are in ollama.rs)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmOllamaModelDetails {
    parameter_size: Option<String>,
    quantization_level: Option<String>,
    family: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmOllamaModel {
    name: String,
    size: Option<u64>,
    details: Option<LlmOllamaModelDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmOllamaTagsResponse {
    models: Vec<LlmOllamaModel>,
}

#[tauri::command]
pub async fn llm_list_ollama_models() -> Result<Vec<ModelInfo>, String> {
    list_ollama_models_internal().await
}

/// AUDIT-COMMAND-075 fix: Alias for llm_list_ollama_models for frontend compatibility
#[tauri::command]
pub async fn llm_get_ollama_models() -> Result<Vec<ModelInfo>, String> {
    list_ollama_models_internal().await
}

async fn list_ollama_models_internal() -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .get(format!("{}/api/tags", OLLAMA_DEFAULT_BASE_URL))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama API returned error: {}", response.status()));
    }

    let tags_response: LlmOllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = tags_response
        .models
        .into_iter()
        .map(|m| {
            let param_size = m
                .details
                .as_ref()
                .and_then(|d| d.parameter_size.clone())
                .unwrap_or_default();

            let is_small = param_size.ends_with('B')
                && param_size
                    .trim_end_matches('B')
                    .parse::<f64>()
                    .unwrap_or(100.0)
                    <= 20.0;

            ModelInfo {
                id: m.name.clone(),
                name: if is_small {
                    format!("{} ({} - Recommended)", m.name, param_size)
                } else {
                    format!("{} ({})", m.name, param_size)
                },
                provider: "ollama".to_string(),
                available: true,
            }
        })
        .collect();

    Ok(models)
}

#[tauri::command]
pub async fn router_suggestions(
    state: State<'_, LLMState>,
    context: Option<RouterContext>,
) -> Result<RouterSuggestionPayload, String> {
    let router = state.router.read().await;
    let suggestion = router.suggest_for_context(&context.unwrap_or_default());
    Ok(RouterSuggestionPayload {
        provider: suggestion.provider.as_string().to_string(),
        model: suggestion.model,
        reason: suggestion.reason,
    })
}

/// Returns capability metadata for a given model.
///
/// For Ollama models the detection queries `/api/show` (cached).
/// For cloud providers a default set is returned since they universally
/// support tools, vision, and streaming.
#[tauri::command]
pub async fn get_model_capabilities(
    provider: String,
    model_id: String,
    base_url: Option<String>,
) -> Result<serde_json::Value, String> {
    if provider.eq_ignore_ascii_case("ollama") {
        let url = base_url
            .filter(|u| !u.is_empty())
            .unwrap_or_else(|| OLLAMA_DEFAULT_BASE_URL.to_string());

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
            &client, &url, &model_id,
        )
        .await;

        let tool_mode = if caps.supports_tools {
            "native"
        } else {
            "prompt_injection"
        };

        Ok(serde_json::json!({
            "supports_tools": caps.supports_tools,
            "supports_vision": caps.supports_vision,
            "supports_streaming": true,
            "supports_thinking": false,
            "context_length": caps.context_length,
            "tool_mode": tool_mode,
        }))
    } else {
        // Cloud providers (openai, anthropic, google, xai, mistral, deepseek, etc.)
        // universally support tools, streaming, and vision for modern models.
        Ok(serde_json::json!({
            "supports_tools": true,
            "supports_vision": true,
            "supports_streaming": true,
            "supports_thinking": true,
            "context_length": 128_000,
            "tool_mode": "native",
        }))
    }
}

/// Clears the in-memory Ollama capability cache so that subsequent
/// `get_model_capabilities` calls re-query `/api/show`.
#[tauri::command]
pub async fn clear_model_capability_cache() -> Result<(), String> {
    crate::core::llm::capability_detection::clear_capability_cache().await;
    Ok(())
}

/// Reset the session cost accumulator to zero.
///
/// The LLM router tracks cumulative cost across all invocations in a session.
/// Once it hits `SESSION_COST_SAFETY_CAP` it refuses new requests. This command
/// lets the frontend (or user) reset the counter — e.g. at conversation start or
/// when the user explicitly acknowledges the spend.
#[tauri::command]
pub async fn reset_session_cost(state: State<'_, LLMState>) -> Result<(), String> {
    let router = state.router.read().await;
    router.reset_cumulative_cost();
    tracing::info!("Session cost accumulator reset to zero");
    Ok(())
}
