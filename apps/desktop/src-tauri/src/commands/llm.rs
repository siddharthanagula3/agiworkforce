use crate::router::providers::{
    anthropic::AnthropicProvider, deepseek::DeepSeekProvider, google::GoogleProvider,
    mistral::MistralProvider, ollama::OllamaProvider, openai::OpenAIProvider,
    qwen::QwenProvider, xai::XAIProvider,
};
use crate::router::{
    cache_manager::CacheManager,
    llm_router::{RouterPreferences, RoutingStrategy},
    ChatMessage, LLMRequest, LLMResponse, LLMRouter, Provider,
};
use anyhow::anyhow;
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
    // Parse provider
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
    };

    let candidates = {
        let router = state.router.lock().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        return Err("No LLM providers are configured.".to_string());
    }

    let mut last_error: Option<anyhow::Error> = None;

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
                last_error = Some(err);
            }
        }
    }

    Err(last_error
        .unwrap_or_else(|| anyhow!("All providers failed"))
        .to_string())
}

#[tauri::command]
pub async fn llm_configure_provider(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    let mut router = state.router.lock().await;

    match provider.as_str() {
        "openai" => {
            if let Some(key) = api_key {
                router.set_openai(Box::new(OpenAIProvider::new(key)));
                Ok(())
            } else {
                Err("OpenAI requires an API key".to_string())
            }
        }
        "anthropic" => {
            if let Some(key) = api_key {
                router.set_anthropic(Box::new(AnthropicProvider::new(key)));
                Ok(())
            } else {
                Err("Anthropic requires an API key".to_string())
            }
        }
        "google" => {
            if let Some(key) = api_key {
                router.set_google(Box::new(GoogleProvider::new(key)));
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
                router.set_xai(Box::new(XAIProvider::new(Some(key))));
                Ok(())
            } else {
                Err("XAI requires an API key".to_string())
            }
        }
        "deepseek" => {
            if let Some(key) = api_key {
                router.set_deepseek(Box::new(DeepSeekProvider::new(Some(key))));
                Ok(())
            } else {
                Err("DeepSeek requires an API key".to_string())
            }
        }
        "qwen" | "alibaba" => {
            if let Some(key) = api_key {
                router.set_qwen(Box::new(QwenProvider::new(Some(key))));
                Ok(())
            } else {
                Err("Qwen requires an API key".to_string())
            }
        }
        "mistral" | "mistralai" => {
            if let Some(key) = api_key {
                router.set_mistral(Box::new(MistralProvider::new(Some(key))));
                Ok(())
            } else {
                Err("Mistral requires an API key".to_string())
            }
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

#[tauri::command]
pub async fn llm_set_default_provider(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<(), String> {
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
