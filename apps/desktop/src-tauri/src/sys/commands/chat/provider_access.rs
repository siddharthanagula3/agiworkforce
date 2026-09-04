use crate::core::llm::Provider;
use crate::data::db::repository;
use crate::sys::commands::chat::state::AppDatabase;
use chrono::{Datelike, Utc};
use std::sync::Arc;
use tracing::{debug, info, warn};

pub(super) fn request_uses_managed_cloud(
    provider: Option<Provider>,
    prefer_cloud_credits: bool,
) -> bool {
    prefer_cloud_credits || matches!(provider, Some(Provider::ManagedCloud))
}

/// Check billing subscription access and monthly budget limits.
/// Returns `Ok(())` if the request is allowed, `Err(String)` if blocked.
pub(super) fn check_billing_and_budget(db: &AppDatabase, user_id: &str) -> Result<(), String> {
    let conn = db
        .connection()
        .map_err(|e| format!("Budget check failed: {e}"))?;

    if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
        if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
            if budget_limit > 0.0 {
                let now = Utc::now();
                let start_of_month = now
                    .date_naive()
                    .with_day(1)
                    .ok_or_else(|| "Failed to determine start of month".to_string())?
                    .and_hms_opt(0, 0, 0)
                    .ok_or_else(|| "Failed to set time for start of month".to_string())?
                    .and_utc();

                let current_usage = repository::sum_cost_since(&conn, start_of_month, user_id)
                    .map_err(|e| format!("Failed to query usage for budget check: {}", e))?;

                if current_usage >= budget_limit {
                    return Err(format!(
                        "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.",
                        current_usage, budget_limit
                    ));
                }
            }
        }
    }

    Ok(())
}

/// Ensure ManagedCloud provider is registered in the router for authenticated users.
///
/// If the user has a valid access token but ManagedCloud is not yet set up, this
/// function initializes and registers it. Does nothing if already present or the
/// user is not authenticated.
pub(crate) async fn ensure_managed_cloud_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::managed_cloud_provider::ManagedCloudProvider;
    use crate::core::llm::Provider;
    use crate::sys::account::get_access_token;

    let has_managed_cloud = {
        let router = router.read().await;
        router.has_provider(Provider::ManagedCloud)
    };

    if !has_managed_cloud {
        match get_access_token() {
            Ok(_) => match ManagedCloudProvider::new() {
                Ok(provider) => {
                    let mut router = router.write().await;
                    router.set_managed_cloud(Box::new(provider));
                    info!("[Chat] Initialized ManagedCloud provider for authenticated user");
                }
                Err(error) => {
                    warn!("[Chat] Failed to create ManagedCloud provider: {}", error);
                }
            },
            Err(_) => {
                debug!("[Chat] User not authenticated, ManagedCloud provider not available");
            }
        }
    }
}

pub(crate) async fn ensure_ollama_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::ollama::OllamaProvider;

    let has_ollama = {
        let router = router.read().await;
        router.has_provider(Provider::Ollama)
    };

    if !has_ollama {
        match OllamaProvider::new(None) {
            Ok(provider) => {
                let mut router = router.write().await;
                router.set_ollama(Box::new(provider));
                info!("[Chat] Lazily registered Ollama provider for Local-mode chat");
            }
            Err(error) => {
                warn!("[Chat] Failed to create Ollama provider: {}", error);
            }
        }
    }

    // LOCAL-CHAT-NOINVOKE-01 diagnostics: confirm the Local-dispatch precondition.
    // candidates() builds the explicit Ollama candidate ONLY when has_provider(Ollama)
    // is true; if `ollama_registered` is false here, the candidate list is empty and the
    // Local send is dropped before /api/chat. Logging the final state pins the cause to
    // provider registration (e.g. OllamaProvider::new failing) vs downstream dispatch.
    let ollama_registered = {
        let router = router.read().await;
        router.has_provider(Provider::Ollama)
    };
    info!(
        target: "chat",
        ollama_registered,
        was_already_present = has_ollama,
        "[Chat] ensure_ollama_provider complete"
    );
}

/// Ensure the LM Studio provider is registered on the router before a Local-mode
/// chat is routed. Mirrors `ensure_ollama_provider` exactly: LM Studio's built-in
/// server is an OpenAI-compatible HTTP API served via `DirectApiProvider`, so this
/// is a no-op once registered and safe to call unconditionally in Local mode. No
/// network call happens until first use (`is_available()` pre-filters the router's
/// candidate list when the local server isn't running).
pub(crate) async fn ensure_lmstudio_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::direct_api_provider::DirectApiProvider;

    let has_lmstudio = {
        let router = router.read().await;
        router.has_provider(Provider::LmStudio)
    };

    if !has_lmstudio {
        match DirectApiProvider::new(Provider::LmStudio, String::new(), None) {
            Ok(provider) => {
                let mut router = router.write().await;
                router.set_provider(Provider::LmStudio, Box::new(provider));
                info!("[Chat] Lazily registered LM Studio provider for Local-mode chat");
            }
            Err(error) => {
                warn!("[Chat] Failed to create LM Studio provider: {}", error);
            }
        }
    }
}

/// Ensure the llama.cpp provider is registered on the router before a Local-mode
/// chat is routed. Mirrors `ensure_ollama_provider`/`ensure_lmstudio_provider`:
/// llama.cpp's built-in `llama-server` exposes an OpenAI-compatible HTTP API.
pub(crate) async fn ensure_llamacpp_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::direct_api_provider::DirectApiProvider;

    let has_llamacpp = {
        let router = router.read().await;
        router.has_provider(Provider::LlamaCpp)
    };

    if !has_llamacpp {
        match DirectApiProvider::new(Provider::LlamaCpp, String::new(), None) {
            Ok(provider) => {
                let mut router = router.write().await;
                router.set_provider(Provider::LlamaCpp, Box::new(provider));
                info!("[Chat] Lazily registered llama.cpp provider for Local-mode chat");
            }
            Err(error) => {
                warn!("[Chat] Failed to create llama.cpp provider: {}", error);
            }
        }
    }
}

/// Ensure the vLLM provider is registered on the router before a Local-mode chat
/// is routed. Mirrors `ensure_ollama_provider`/`ensure_lmstudio_provider`/
/// `ensure_llamacpp_provider`: vLLM's OpenAI-compatible server (default
/// `http://localhost:8000/v1`) is served via `DirectApiProvider`.
pub(crate) async fn ensure_vllm_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::direct_api_provider::DirectApiProvider;

    let has_vllm = {
        let router = router.read().await;
        router.has_provider(Provider::Vllm)
    };

    if !has_vllm {
        match DirectApiProvider::new(Provider::Vllm, String::new(), None) {
            Ok(provider) => {
                let mut router = router.write().await;
                router.set_provider(Provider::Vllm, Box::new(provider));
                info!("[Chat] Lazily registered vLLM provider for Local-mode chat");
            }
            Err(error) => {
                warn!("[Chat] Failed to create vLLM provider: {}", error);
            }
        }
    }
}

/// Reuse the chat runtime-registration seam for non-chat local work. This does
/// not select a model or broaden the trust boundary; it only makes the exact
/// provider already admitted by the Task submission reachable in the shared
/// router. BYOK providers remain startup/keyring-owned.
pub(crate) async fn ensure_task_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
    provider: Provider,
) {
    match provider {
        Provider::Ollama => ensure_ollama_provider(router).await,
        Provider::LmStudio => ensure_lmstudio_provider(router).await,
        Provider::LlamaCpp => ensure_llamacpp_provider(router).await,
        Provider::Vllm => ensure_vllm_provider(router).await,
        Provider::ManagedCloud => ensure_managed_cloud_provider(router).await,
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_cloud_requests_use_subscription_gate() {
        assert!(request_uses_managed_cloud(
            Some(Provider::ManagedCloud),
            false
        ));
        assert!(request_uses_managed_cloud(Some(Provider::Ollama), true));
    }

    #[test]
    fn local_and_byok_requests_skip_subscription_gate() {
        assert!(!request_uses_managed_cloud(Some(Provider::Ollama), false));
        assert!(!request_uses_managed_cloud(Some(Provider::OpenAI), false));
        assert!(!request_uses_managed_cloud(None, false));
    }
}
