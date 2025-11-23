use crate::router::providers::{
    anthropic::AnthropicProvider, deepseek::DeepSeekProvider, google::GoogleProvider,
    mistral::MistralProvider, ollama::OllamaProvider, openai::OpenAIProvider, qwen::QwenProvider,
    xai::XAIProvider,
};
use crate::router::{
    cache_manager::CacheManager,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    ChatMessage, LLMRequest, LLMResponse, LLMRouter, Provider,
};
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

// Updated Nov 16, 2025: Added comprehensive input validation
#[tauri::command]
pub async fn llm_send_message(
    request: LLMSendMessageRequest,
    state: State<'_, LLMState>,
) -> Result<LLMResponse, String> {
    // Validate messages array is not empty
    if request.messages.is_empty() {
        return Err("Messages array cannot be empty".to_string());
    }
    if request.messages.len() > 1000 {
        return Err(format!(
            "Too many messages: {}. Maximum is 1000",
            request.messages.len()
        ));
    }

    // Validate temperature if provided
    if let Some(temp) = request.temperature {
        if temp < 0.0 || temp > 2.0 {
            return Err(format!(
                "Invalid temperature: {}. Must be between 0.0 and 2.0",
                temp
            ));
        }
    }

    // Validate max_tokens if provided
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

    // Parse provider
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
    };

    let preferences = RouterPreferences {
        provider,
        model: request.model.clone(),
        strategy: RoutingStrategy::Auto,
        context: None,
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
                
                // Check for specific error types
                if error_msg.contains("401") || error_msg.contains("Unauthorized") || error_msg.contains("invalid_api_key") {
                    return Err(format!(
                        "API key authentication failed for {}. Please check your API key in Settings > API Keys.",
                        candidate.provider.as_string()
                    ));
                }
                if error_msg.contains("decode") || error_msg.contains("deserialize") || error_msg.contains("JSON") {
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

    // Return detailed error message
    if let Some(err) = last_error {
        let mut error_text = format!("All providers failed. Errors: {}", error_messages.join("; "));
        let err_str = err.to_string();
        if !err_str.is_empty() {
            error_text = format!("{} Last error: {}", error_text, err_str);
        }
        return Err(error_text);
    }
    
    Err("All providers failed with unknown errors.".to_string())
}

// Updated Nov 16, 2025: Added input validation for API keys
#[tauri::command]
pub async fn llm_configure_provider(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    // Validate provider name
    if provider.trim().is_empty() {
        return Err("Provider name cannot be empty".to_string());
    }

    // Validate API key if provided (check trimmed length)
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

    // Validate base URL if provided
    if let Some(ref url) = base_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
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
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

// Updated Nov 16, 2025: Added input validation
#[tauri::command]
pub async fn llm_set_default_provider(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    // Validate provider name
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
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    router.set_default_provider(provider_enum);
    Ok(())
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
    _state: State<'_, LLMState>,
) -> Result<Vec<ModelInfo>, String> {
    // Return all supported models
    // In a real implementation, this would query each provider for their available models
    let models = vec![
        // OpenAI
        ModelInfo {
            id: "gpt-5".to_string(),
            name: "GPT-5".to_string(),
            provider: "openai".to_string(),
            available: true,
        },
        ModelInfo {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            provider: "openai".to_string(),
            available: true,
        },
        ModelInfo {
            id: "o3".to_string(),
            name: "O3".to_string(),
            provider: "openai".to_string(),
            available: true,
        },
        ModelInfo {
            id: "gpt-4o-mini".to_string(),
            name: "GPT-4o Mini".to_string(),
            provider: "openai".to_string(),
            available: true,
        },
        // Anthropic
        ModelInfo {
            id: "claude-sonnet-4-5".to_string(),
            name: "Claude Sonnet 4.5".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ModelInfo {
            id: "claude-haiku-4-5".to_string(),
            name: "Claude Haiku 4.5".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        ModelInfo {
            id: "claude-opus-4".to_string(),
            name: "Claude Opus 4".to_string(),
            provider: "anthropic".to_string(),
            available: true,
        },
        // Google
        ModelInfo {
            id: "gemini-2.5-pro".to_string(),
            name: "Gemini 2.5 Pro".to_string(),
            provider: "google".to_string(),
            available: true,
        },
        ModelInfo {
            id: "gemini-2.5-flash".to_string(),
            name: "Gemini 2.5 Flash".to_string(),
            provider: "google".to_string(),
            available: true,
        },
        // Ollama
        ModelInfo {
            id: "llama4-maverick".to_string(),
            name: "Llama 4 Maverick".to_string(),
            provider: "ollama".to_string(),
            available: true,
        },
        ModelInfo {
            id: "deepseek-coder-v3".to_string(),
            name: "DeepSeek Coder V3".to_string(),
            provider: "ollama".to_string(),
            available: true,
        },
    ];

    Ok(models)
}

#[tauri::command]
pub async fn llm_check_provider_status(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<ProviderStatus, String> {
    let router = state.router.lock().await;

    // Check if provider is configured
    let provider_enum = match provider.as_str() {
        "openai" => Provider::OpenAI,
        "anthropic" => Provider::Anthropic,
        "google" => Provider::Google,
        "ollama" => Provider::Ollama,
        "xai" | "grok" => Provider::XAI,
        "deepseek" => Provider::DeepSeek,
        "qwen" | "alibaba" => Provider::Qwen,
        "mistral" | "mistralai" => Provider::Mistral,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };
    let configured = router.has_provider(provider_enum);

    // For Ollama, check if server is running
    let mut ollama_running = None;
    if provider == "ollama" {
        // Try to connect to Ollama server
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

    // For now, assume available if configured (except Ollama which needs server running)
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
        rate_limit_remaining: None, // Could be implemented with actual API calls
        rate_limit_reset: None,
        ollama_running,
    })
}

#[tauri::command]
pub async fn llm_get_usage_stats() -> Result<UsageStats, String> {
    // This would normally query the database for usage statistics
    // For now, return empty stats
    // TODO: Implement database queries to aggregate usage from chat history

    let mut by_provider = std::collections::HashMap::new();
    by_provider.insert(
        "openai".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "anthropic".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "google".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "ollama".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "xai".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "deepseek".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "qwen".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );
    by_provider.insert(
        "mistral".to_string(),
        ProviderUsage {
            tokens: 0,
            cost: 0.0,
            messages: 0,
        },
    );

    Ok(UsageStats {
        total_tokens: 0,
        total_cost: 0.0,
        message_count: 0,
        by_provider,
        by_model: std::collections::HashMap::new(),
    })
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
