use crate::core::router::providers::{
    anthropic::AnthropicProvider, deepseek::DeepSeekProvider, google::GoogleProvider,
    managed_cloud_provider::ManagedCloudProvider, mistral::MistralProvider, ollama::OllamaProvider,
    openai::OpenAIProvider, qwen::QwenProvider, xai::XAIProvider,
};
use crate::core::router::{
    cache_manager::CacheManager,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    ChatMessage, LLMRequest, LLMResponse, LLMRouter, Provider,
};
use crate::sys::commands::chat::AppDatabase;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;

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
    pub router: Arc<Mutex<LLMRouter>>,
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
            router: Arc::new(Mutex::new(LLMRouter::new())),
            cache_manager: CacheManager::new(Duration::from_secs(60 * 60 * 24), 512),
        }
    }
}

#[tauri::command]
pub async fn llm_send_message(
    request: LLMSendMessageRequest,
    state: State<'_, LLMState>,
) -> Result<LLMResponse, String> {
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

    let provider_name = request.provider.clone();
    let provider = request.provider.as_deref().and_then(|p| match p {
        "openai" => Some(Provider::OpenAI),
        "anthropic" => Some(Provider::Anthropic),
        "google" => Some(Provider::Google),
        "ollama" => Some(Provider::Ollama),
        "xai" | "grok" => Some(Provider::XAI),
        "deepseek" => Some(Provider::DeepSeek),
        "qwen" | "alibaba" => Some(Provider::Qwen),
        "mistral" | "mistralai" => Some(Provider::Mistral),
        "managed_cloud" | "managedcloud" | "cloud" => Some(Provider::ManagedCloud),
        _ => None,
    });

    let model = request
        .model
        .clone()
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    let llm_request = LLMRequest {
        messages: request.messages,
        model: model.clone(),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
    };

    let preferences = RouterPreferences {
        provider,
        model: request.model.clone(),
        strategy: RoutingStrategy::Auto,
        context: None,
        prefer_cloud_credits: request.prefer_cloud_credits,
    };

    let candidates = {
        let router = state.router.lock().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        if let Some(name) = provider_name {
            return Err(format!(
                "Provider '{}' is not configured. Add an API key in Settings > API Keys.",
                name
            ));
        }
        return Err("No LLM providers are configured.".to_string());
    }

    let mut last_error: Option<anyhow::Error> = None;
    let mut error_messages: Vec<String> = Vec::new();

    for candidate in candidates {
        let res = {
            let router = state.router.lock().await;
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

                if error_msg.contains("401")
                    || error_msg.contains("Unauthorized")
                    || error_msg.contains("invalid_api_key")
                {
                    return Err(format!(
                        "API key authentication failed for {}. Please check your API key in Settings > API Keys.",
                        candidate.provider.as_string()
                    ));
                }
                if error_msg.contains("decode")
                    || error_msg.contains("deserialize")
                    || error_msg.contains("JSON")
                {
                    return Err(format!(
                        "Error decoding response from {}: {}. This may indicate an API issue or invalid response format.",
                        candidate.provider.as_string(),
                        error_msg
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

    if let Some(ref key) = api_key {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err("API key cannot be empty".to_string());
        }
        if trimmed.len() < 10 {
            return Err("API key too short. Minimum length is 10 characters".to_string());
        }
        if trimmed.len() > 500 {
            return Err(format!(
                "API key too long: {} characters. Maximum is 500",
                trimmed.len()
            ));
        }
    }

    if let Some(ref url) = base_url {
        if !url.starts_with("http") {
            return Err(format!(
                "Invalid base URL: {}. Must start with http:// or https://",
                url
            ));
        }

        if url.len() > 1000 {
            return Err(format!(
                "Base URL too long: {} characters. Maximum is 1000",
                url.len()
            ));
        }
    }

    let mut router = state.router.lock().await;

    match provider.as_str() {
        "openai" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_openai(Box::new(OpenAIProvider::new(trimmed_key)));
                Ok(())
            } else {
                Err("OpenAI requires an API key".to_string())
            }
        }
        "anthropic" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_anthropic(Box::new(AnthropicProvider::new(trimmed_key)));
                Ok(())
            } else {
                Err("Anthropic requires an API key".to_string())
            }
        }
        "google" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_google(Box::new(GoogleProvider::new(trimmed_key)));
                Ok(())
            } else {
                Err("Google requires an API key".to_string())
            }
        }
        "ollama" => {
            router.set_ollama(Box::new(OllamaProvider::new(base_url)));
            Ok(())
        }
        "xai" | "grok" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_xai(Box::new(XAIProvider::new(Some(trimmed_key))));
                Ok(())
            } else {
                Err("XAI requires an API key".to_string())
            }
        }
        "deepseek" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_deepseek(Box::new(DeepSeekProvider::new(Some(trimmed_key))));
                Ok(())
            } else {
                Err("DeepSeek requires an API key".to_string())
            }
        }
        "qwen" | "alibaba" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_qwen(Box::new(QwenProvider::new(Some(trimmed_key))));
                Ok(())
            } else {
                Err("Qwen requires an API key".to_string())
            }
        }
        "mistral" | "mistralai" => {
            if let Some(key) = api_key {
                let trimmed_key = key.trim().to_string();
                router.set_mistral(Box::new(MistralProvider::new(Some(trimmed_key))));
                Ok(())
            } else {
                Err("Mistral requires an API key".to_string())
            }
        }
        "managed_cloud" | "managedcloud" | "cloud" => {
            // ManagedCloud doesn't need an API key - it uses the access token from keyring
            router.set_managed_cloud(Box::new(ManagedCloudProvider::new()));
            Ok(())
        }
        _ => Err(format!("Unknown provider: {}", provider)),
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

    let mut router = state.router.lock().await;

    let provider_enum = match provider.as_str() {
        "openai" => Provider::OpenAI,
        "anthropic" => Provider::Anthropic,
        "google" => Provider::Google,
        "ollama" => Provider::Ollama,
        "xai" | "grok" => Provider::XAI,
        "deepseek" => Provider::DeepSeek,
        "qwen" | "alibaba" => Provider::Qwen,
        "mistral" | "mistralai" => Provider::Mistral,
        "managed_cloud" | "managedcloud" | "cloud" => Provider::ManagedCloud,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

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
            let mut router = state.router.lock().await;
            router.set_managed_cloud(Box::new(ManagedCloudProvider::new()));
            Ok(true)
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
    let router = state.router.lock().await;

    let all_models = vec![
        // OpenAI
        ModelInfo {
            id: "gpt-5.2".to_string(),
            name: "GPT-5.2".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.2-pro".to_string(),
            name: "GPT-5.2 Pro".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.2-chat-latest".to_string(),
            name: "GPT-5.2 Chat".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.2-codex".to_string(),
            name: "GPT-5.2 Codex".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.1".to_string(),
            name: "GPT-5.1".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.1-chat-latest".to_string(),
            name: "GPT-5.1 Instant".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.1-thinking".to_string(),
            name: "GPT-5.1 Thinking".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gpt-5.1-codex-max".to_string(),
            name: "GPT-5.1-Codex-Max".to_string(),
            provider: "openai".to_string(),
            available: false,
        },
        // Anthropic
        ModelInfo {
            id: "claude-sonnet-4-5".to_string(),
            name: "Claude Sonnet 4.5".to_string(),
            provider: "anthropic".to_string(),
            available: false,
        },
        ModelInfo {
            id: "claude-haiku-4-5".to_string(),
            name: "Claude Haiku 4.5".to_string(),
            provider: "anthropic".to_string(),
            available: false,
        },
        ModelInfo {
            id: "claude-opus-4-5".to_string(),
            name: "Claude Opus 4.5".to_string(),
            provider: "anthropic".to_string(),
            available: false,
        },
        // Google
        ModelInfo {
            id: "gemini-3-pro".to_string(),
            name: "Gemini 3 Pro".to_string(),
            provider: "google".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gemini-3-flash".to_string(),
            name: "Gemini 3 Flash".to_string(),
            provider: "google".to_string(),
            available: false,
        },
        ModelInfo {
            id: "gemini-3-deep-think".to_string(),
            name: "Gemini 3 Deep Think".to_string(),
            provider: "google".to_string(),
            available: false,
        },
        // xAI
        ModelInfo {
            id: "grok-4.1".to_string(),
            name: "Grok 4.1".to_string(),
            provider: "xai".to_string(),
            available: false,
        },
        ModelInfo {
            id: "grok-4.1-fast".to_string(),
            name: "Grok 4.1 Fast".to_string(),
            provider: "xai".to_string(),
            available: false,
        },
        // Qwen
        ModelInfo {
            id: "qwen3-max".to_string(),
            name: "Qwen3-Max".to_string(),
            provider: "qwen".to_string(),
            available: false,
        },
        // Moonshot
        ModelInfo {
            id: "kimi-k2-thinking".to_string(),
            name: "Kimi K2 Thinking".to_string(),
            provider: "moonshot".to_string(),
            available: false,
        },
    ];

    let mut available_models = Vec::new();

    let managed_cloud_available = router.has_provider(Provider::ManagedCloud);

    for mut model in all_models {
        let provider_enum = match model.provider.as_str() {
            "openai" => Provider::OpenAI,
            "anthropic" => Provider::Anthropic,
            "google" => Provider::Google,
            "xai" => Provider::XAI,
            "qwen" => Provider::Qwen,
            "moonshot" | "mistral" => Provider::Mistral,
            _ => continue,
        };

        if router.has_provider(provider_enum) || managed_cloud_available {
            model.available = true;
            available_models.push(model);
        }
    }

    if router.has_provider(Provider::Ollama) {
        match llm_list_ollama_models().await {
            Ok(ollama_models) => {
                available_models.extend(ollama_models);
            }
            Err(e) => {
                tracing::warn!("Failed to fetch Ollama models: {}", e);

                available_models.push(ModelInfo {
                    id: "llama4-70b-instruct".to_string(),
                    name: "Llama 4 70B Instruct (Offline)".to_string(),
                    provider: "ollama".to_string(),
                    available: false,
                });
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
    let router = state.router.lock().await;

    let provider_enum = match provider.as_str() {
        "openai" => Provider::OpenAI,
        "anthropic" => Provider::Anthropic,
        "google" => Provider::Google,
        "ollama" => Provider::Ollama,
        "xai" | "grok" => Provider::XAI,
        "deepseek" => Provider::DeepSeek,
        "qwen" | "alibaba" => Provider::Qwen,
        "mistral" | "mistralai" => Provider::Mistral,
        "managed_cloud" | "managedcloud" | "cloud" => Provider::ManagedCloud,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };
    let configured = router.has_provider(provider_enum);

    let mut ollama_running = None;
    if provider == "ollama" {
        let client = reqwest::Client::new();
        match client
            .get("http://localhost:11434/api/tags")
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
            Some("Provider not configured. Please add API key in settings.".to_string())
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
            COUNT(*) as message_coun
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModelDetails {
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
    pub family: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<u64>,
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaModel>,
}

#[tauri::command]
pub async fn llm_list_ollama_models() -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:11434/api/tags")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama API returned error: {}", response.status()));
    }

    let tags_response: OllamaTagsResponse = response
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
    let router = state.router.lock().await;
    let suggestion = router.suggest_for_context(&context.unwrap_or_default());
    Ok(RouterSuggestionPayload {
        provider: suggestion.provider.as_string().to_string(),
        model: suggestion.model,
        reason: suggestion.reason,
    })
}
