use crate::core::llm::providers::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::providers::{
    direct_api_provider::DirectApiProvider, managed_cloud_provider::ManagedCloudProvider,
    ollama::OllamaProvider,
};
use crate::core::llm::{
    cache_manager::CacheManager,
    llm_router::{RouterContext, RouterPreferences, RoutingStrategy},
    ChatMessage, LLMRequest, LLMResponse, LLMRouter, Provider, TaskType,
};
use crate::sys::commands::chat::AppDatabase;
use crate::sys::security::prompt_injection::PromptInjectionDetector;
use crate::sys::security::rate_limit::{RateLimitConfig, RateLimiter};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::RwLock;

use crate::core::llm::providers::direct_api_provider::{default_base_url, local_runtime_label};
use crate::core::llm::OLLAMA_DEFAULT_BASE_URL;

/// The URL a Local runtime is actually reached at: the one registered in the
/// router (what chat sends to), or the runtime's default when none is
/// registered yet, which is also what chat registers lazily.
fn local_runtime_base_url(router: &LLMRouter, provider: Provider) -> String {
    router
        .provider_base_url(provider)
        .unwrap_or_else(|| match provider {
            Provider::Ollama => OLLAMA_DEFAULT_BASE_URL.to_string(),
            other => default_base_url(other).unwrap_or_default().to_string(),
        })
}

/// The Ollama URL the user configured, as chat reaches it, for local work
/// outside chat such as embeddings and memory extraction.
pub async fn configured_ollama_url(router: &RwLock<LLMRouter>) -> String {
    local_runtime_base_url(&*router.read().await, Provider::Ollama)
}

fn create_llm_command_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    create_http_client(&HttpClientConfig {
        read_timeout_secs: Some(timeout_secs),
        ..Default::default()
    })
}

fn default_model() -> String {
    Provider::OpenAI
        .get_model_for_task(TaskType::FastCompletion)
        .to_string()
}

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
/// Prefix of the error a helper call returns when its trust boundary leaves
/// no provider to send to. Callers use it to fall back without AI.
const NO_CANDIDATES_ERROR_CODE: &str = "[ERR_NO_CANDIDATES]";

fn resolve_provider_for_routing(s: &str) -> Option<Provider> {
    Provider::from_string(s)
}

/// FIX-F19 (audit 2026-05-19): wire the previously-dormant
/// `PromptInjectionDetector` into LLM ingress. **Detect-and-log only per plan;
/// do NOT block**, false-positive rate on legitimate code prompts is too high
/// to gate the user's request. Emits a `tracing::warn` with the risk score,
/// confidence, detected patterns, and recommendation so audit_logger / Sentry
/// pick up the signal for later analysis.
fn scan_messages_for_prompt_injection(messages: &[ChatMessage]) {
    use std::sync::OnceLock;
    static DETECTOR: OnceLock<PromptInjectionDetector> = OnceLock::new();
    let detector = DETECTOR.get_or_init(PromptInjectionDetector::new);
    for (idx, msg) in messages.iter().enumerate() {
        if msg.role != "user" {
            continue;
        }
        let analysis = detector.analyze(&msg.content);
        if !analysis.is_safe {
            tracing::warn!(
                target: "agi.llm.prompt_injection",
                message_index = idx,
                risk_score = analysis.risk_score,
                confidence = analysis.confidence,
                detected_patterns = ?analysis.detected_patterns,
                recommendation = ?analysis.recommendation,
                "FIX-F19: prompt injection signal in user message (detect+log only, not blocking)"
            );
        }
    }
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
    /// Explicit execution boundary for lightweight helper calls. Absent stays
    /// fail-closed to Local in the router.
    #[serde(
        default,
        deserialize_with = "crate::sys::commands::agi::deserialize_trust_mode"
    )]
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
}

/// Build the plain LLM request used by `llm_send_message`.
///
/// This IPC command is intentionally not the Desktop chat/agent path. It is
/// used for lightweight helper calls such as voice cleanup and direct
/// completion-style flows. Tool-capable chat must go through
/// `chat_send_message`, where tool schemas, MCP exposure, streaming events,
/// approvals, and follow-up tool loops are assembled in one place.
fn build_plain_llm_request(request: &LLMSendMessageRequest, model: String) -> LLMRequest {
    LLMRequest {
        messages: request.messages.clone(),
        model,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    }
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

    pub async fn with_cache(db_connection: Arc<std::sync::Mutex<rusqlite::Connection>>) -> Self {
        let cache_manager = CacheManager::new(Duration::from_secs(60 * 60 * 24), 512);
        let router = Arc::new(RwLock::new(LLMRouter::new()));

        {
            let mut router_guard = router.write().await;
            router_guard.set_cache(cache_manager.clone(), db_connection);
        }

        Self {
            router,
            cache_manager,
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

    route_plain_llm_request(&state.router, request).await
}

async fn route_plain_llm_request(
    router: &RwLock<LLMRouter>,
    request: LLMSendMessageRequest,
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

    // FIX-F19 (audit 2026-05-19): scan inbound user messages for prompt
    // injection signals. Detect-and-log only (no blocking), emit telemetry
    // via `tracing::warn` on `agi.llm.prompt_injection` so audit_logger picks
    // it up. Wire-up of the previously-dormant detector.
    scan_messages_for_prompt_injection(&request.messages);

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
        crate::sys::account::app_mode::require_cloud_app_mode()?;
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

    let model = request.model.clone().unwrap_or_else(default_model);

    let llm_request = build_plain_llm_request(&request, model.clone());

    let managed_cloud_only = matches!(
        request.trust_mode.as_ref(),
        Some(agiworkforce_model_registry::TrustMode::ManagedCloud)
    );
    let preferences = RouterPreferences {
        provider,
        model: request.model.clone(),
        strategy: RoutingStrategy::Auto,
        context: None,
        prefer_cloud_credits: request.prefer_cloud_credits,
        local_only: false,
        managed_cloud_only,
        // TRUST BOUNDARY (desktop-trust-boundary-01): `llm_send_message` is a
        // directly-exposed IPC command (voice cleanup, ghost-text-style
        // helper calls per the doc comment on `LLMSendMessageRequest`), not
        // routed through `chat_send_message`'s trust-mode resolution. Calls
        // that omit the field still fail closed to Local via
        // `effective_trust_mode`; Cloud voice supplies ManagedCloud only after
        // the frontend captures and validates its authenticated boundary.
        trust_mode: request.trust_mode,
    };

    let candidates = {
        let router = router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        // SECURITY: the redirect below is reachable only when the request's
        // own trust mode is Managed Cloud. A Local or BYOK request that names
        // an unconfigured provider ends here with no candidate.
        let router = router.read().await;
        let managed_cloud_available =
            managed_cloud_only && router.has_provider(Provider::ManagedCloud);

        if let (true, Some(requested)) = (managed_cloud_available, provider_name.as_ref()) {
            tracing::info!(
                "Redirecting request for unconfigured provider '{}' to Managed Cloud",
                requested
            );

            // Create a fallback candidate for Managed Cloud
            // We use "managed-cloud-auto" or pass the requested model as a hint if compatible
            let fallback_candidate = crate::core::llm::llm_router::RouteCandidate {
                provider: Provider::ManagedCloud,
                model: request.model.clone().unwrap_or_else(default_model),
                reason: "fallback-redirect-to-managed-cloud",
                strategy: None,
            };

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

        if !managed_cloud_only {
            let reason = if matches!(
                request.trust_mode,
                Some(agiworkforce_model_registry::TrustMode::Byok)
            ) {
                "The selected BYOK provider is not configured."
            } else {
                crate::core::llm::llm_router::local_only_no_candidate_message(provider)
            };
            return Err(format!("{NO_CANDIDATES_ERROR_CODE} {reason}"));
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
            let router = router.read().await;
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

/// Where the user has agreed, in a native dialog, that a saved key may be
/// sent besides its provider's own endpoint: `provider address` pairs. Only
/// this module writes the row, and no page-callable command writes
/// `settings_v2`.
const SAVED_KEY_DESTINATIONS_SETTING: &str = "llm.saved_key_destinations";
const SEND_SAVED_KEY_CONFIRM_LABEL: &str = "Send Saved Key";
/// One such question at a time, and a wait after a no that grows while the
/// noes keep coming.
static SAVED_KEY_DESTINATION_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

/// The server a base URL names, as `host`, or `host:port` when the port is
/// not the scheme's own. Every loopback spelling is `localhost`, so
/// `127.0.0.1` and `localhost` are one place.
fn destination_of(base_url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(base_url.trim()).ok()?;
    let host = match parsed.host()? {
        url::Host::Domain(domain) if domain.eq_ignore_ascii_case("localhost") => {
            "localhost".to_string()
        }
        url::Host::Domain(domain) => domain.to_ascii_lowercase(),
        url::Host::Ipv4(address) if address.is_loopback() => "localhost".to_string(),
        url::Host::Ipv6(address) if address.is_loopback() => "localhost".to_string(),
        url::Host::Ipv4(address) => address.to_string(),
        url::Host::Ipv6(address) => format!("[{address}]"),
    };
    Some(match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host,
    })
}

/// The server a provider's registered endpoint names. Azure has none: every
/// Azure deployment address is the user's own.
fn registered_destination(provider: Provider) -> Option<String> {
    default_base_url(provider).and_then(destination_of)
}

fn provider_name(provider: Provider) -> &'static str {
    local_runtime_label(provider).unwrap_or_else(|| provider.as_string())
}

fn saved_key_destination_entry(provider: Provider, destination: &str) -> String {
    format!("{} {}", provider.as_string(), destination)
}

/// A row that is missing or does not parse remembers nothing, so the
/// question is asked again.
fn remembered_saved_key_destinations(conn: &rusqlite::Connection) -> Vec<String> {
    conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        [SAVED_KEY_DESTINATIONS_SETTING],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|stored| serde_json::from_str::<Vec<String>>(&stored).ok())
    .unwrap_or_default()
}

fn remember_saved_key_destination(
    conn: &rusqlite::Connection,
    provider: Provider,
    destination: &str,
) -> Result<(), String> {
    let mut remembered = remembered_saved_key_destinations(conn);
    let entry = saved_key_destination_entry(provider, destination);
    if !remembered.contains(&entry) {
        remembered.push(entry);
    }
    let stored = serde_json::to_string(&remembered)
        .map_err(|e| format!("Failed to remember where the saved key may go: {e}"))?;
    crate::core::mcp::config::upsert_settings_v2_value(
        conn,
        SAVED_KEY_DESTINATIONS_SETTING,
        &stored,
        "security",
        false,
    )
}

/// Removing a provider's saved key ends what was agreed for it, so a key
/// saved later is asked about afresh.
fn forget_saved_key_destinations(
    conn: &rusqlite::Connection,
    provider: Provider,
) -> Result<(), String> {
    let remembered = remembered_saved_key_destinations(conn);
    let own = format!("{} ", provider.as_string());
    let kept: Vec<String> = remembered
        .iter()
        .filter(|entry| !entry.starts_with(&own))
        .cloned()
        .collect();
    if kept.len() == remembered.len() {
        return Ok(());
    }
    let stored = serde_json::to_string(&kept)
        .map_err(|e| format!("Failed to forget where the saved key may go: {e}"))?;
    crate::core::mcp::config::upsert_settings_v2_value(
        conn,
        SAVED_KEY_DESTINATIONS_SETTING,
        &stored,
        "security",
        false,
    )
}

/// The question for sending a saved key somewhere other than its provider's
/// registered endpoint. Every fact in it comes from this side: the provider,
/// the address the request named, and the endpoint the key normally goes to.
fn saved_key_destination_question(
    provider: Provider,
    destination: &str,
) -> Result<crate::sys::native_confirm::NativeConfirm, String> {
    let name = provider_name(provider);
    let usual = registered_destination(provider)
        .map(|usual| format!(" instead of {usual}"))
        .unwrap_or_default();
    let body = format!(
        "Your saved {name} key will be sent to {}{usual}, with every request made through {name}.\n\nSay yes only if you entered this address yourself.",
        crate::sys::native_confirm::shown_value(destination)
    );
    crate::sys::native_confirm::check_it_fits(&body).map_err(|rows| {
        format!(
            "The address is too long to show in full ({rows} rows), so the saved {name} key was not sent there."
        )
    })?;
    Ok(crate::sys::native_confirm::NativeConfirm {
        title: format!("Send your saved {name} key to another server?"),
        body,
        confirm_label: SEND_SAVED_KEY_CONFIRM_LABEL.to_string(),
    })
}

/// Providers left unconnected because their saved key would have gone to an
/// address the user has not agreed to, keyed by provider id, with the address.
/// The status command reports it, so the Models row can say why and offer the
/// reconnect that asks.
static SAVED_KEYS_AWAITING_CONFIRMATION: std::sync::Mutex<
    std::collections::BTreeMap<String, String>,
> = std::sync::Mutex::new(std::collections::BTreeMap::new());

fn awaiting_confirmation(
) -> std::sync::MutexGuard<'static, std::collections::BTreeMap<String, String>> {
    match SAVED_KEYS_AWAITING_CONFIRMATION.lock() {
        Ok(awaiting) => awaiting,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn saved_key_awaits_confirmation(provider: Provider) -> Option<String> {
    awaiting_confirmation().get(provider.as_string()).cloned()
}

fn reconnect_to_confirm_message(destination: &str) -> String {
    format!("Reconnect to confirm sending your saved key to {destination}.")
}

/// What to do with a saved key and the address a registration names.
#[derive(Debug, PartialEq, Eq)]
enum SavedKeyDestination {
    /// The provider's own endpoint, or an address already agreed to.
    Allowed,
    /// Somewhere else: only the user can agree, and only when asked.
    NeedsConfirmation(String),
}

fn saved_key_destination(
    provider: Provider,
    base_url: Option<&str>,
    remembered: &[String],
) -> Result<SavedKeyDestination, String> {
    let Some(custom) = base_url.map(str::trim).filter(|url| !url.is_empty()) else {
        return Ok(SavedKeyDestination::Allowed);
    };
    let name = provider_name(provider);
    let destination = destination_of(custom)
        .ok_or_else(|| format!("That is not an address the saved {name} key can be sent to."))?;
    if registered_destination(provider).as_deref() == Some(destination.as_str())
        || remembered.contains(&saved_key_destination_entry(provider, &destination))
    {
        return Ok(SavedKeyDestination::Allowed);
    }
    Ok(SavedKeyDestination::NeedsConfirmation(destination))
}

/// A saved key goes to its provider's registered endpoint without a
/// question. Anywhere else, the window naming the address is not enough.
///
/// The native question is raised only for something the person just did
/// (`asked_by_user`): the reconnect or save-key button of the provider's row.
/// Settings rehydration at start, a re-registration after the vault or the
/// proxy changes, and every other background path never raise it. They leave
/// the provider unconnected and record why, for the row to show.
async fn allow_saved_key_destination(
    app: &tauri::AppHandle,
    provider: Provider,
    base_url: Option<&str>,
    asked_by_user: bool,
) -> Result<(), String> {
    let remembered = {
        let conn = crate::core::mcp::config::open_mcp_settings_db()?;
        remembered_saved_key_destinations(&conn)
    };
    let destination = match saved_key_destination(provider, base_url, &remembered)? {
        SavedKeyDestination::Allowed => {
            awaiting_confirmation().remove(provider.as_string());
            return Ok(());
        }
        SavedKeyDestination::NeedsConfirmation(destination) => destination,
    };

    awaiting_confirmation().insert(provider.as_string().to_string(), destination.clone());
    if !asked_by_user {
        return Err(reconnect_to_confirm_message(&destination));
    }

    let name = provider_name(provider);
    let question = saved_key_destination_question(provider, &destination)?;
    let entry = saved_key_destination_entry(provider, &destination);
    let confirmed = SAVED_KEY_DESTINATION_DECISIONS
        .confirm(app, &entry, question)
        .await
        .map_err(|held| held.message())?;
    if !confirmed {
        return Err(format!(
            "Sending the saved {name} key to {destination} was not confirmed, so {name} was not connected."
        ));
    }
    let conn = crate::core::mcp::config::open_mcp_settings_db()?;
    remember_saved_key_destination(&conn, provider, &destination)?;
    awaiting_confirmation().remove(provider.as_string());
    Ok(())
}

/// `user_initiated` says the person just pressed connect, reconnect or save
/// key for this provider. It is the only case in which a native question may
/// be raised; without it a saved key that would go somewhere unconfirmed
/// leaves the provider unconnected.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn llm_configure_provider(
    app: tauri::AppHandle,
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    allow_private_network: Option<bool>,
    user_initiated: Option<bool>,
    state: State<'_, LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<(), String> {
    if provider.trim().is_empty() {
        return Err("Provider name cannot be empty".to_string());
    }

    let allow_private_network = allow_private_network.unwrap_or(false);
    let asked_by_user = user_initiated.unwrap_or(false);

    match provider.as_str() {
        "ollama" => {
            // Validated here rather than at send time: a bad or off-machine URL
            // would otherwise surface as a generic "no local provider reachable".
            let ollama = OllamaProvider::new_local_runtime(base_url, allow_private_network)
                .map_err(|e| format!("Failed to configure Ollama: {}", e))?;
            state.router.write().await.set_ollama(Box::new(ollama));
            Ok(())
        }
        "lmstudio" | "llamacpp" | "vllm" => {
            let provider_enum = match provider.as_str() {
                "lmstudio" => Provider::LmStudio,
                "llamacpp" => Provider::LlamaCpp,
                _ => Provider::Vllm,
            };
            // A server started with an API key (`vllm serve --api-key`) refuses
            // requests without it. A key passed in this call goes where this
            // call says; a saved one goes to this computer's default address,
            // or to another address only after the user has agreed to it.
            let local_key = match api_key.filter(|key| !key.is_empty()) {
                Some(key) => {
                    awaiting_confirmation().remove(provider_enum.as_string());
                    Some(key)
                }
                None => {
                    let saved = crate::sys::commands::mcp_oauth::retrieve_api_key(
                        Some(encryption.inner()),
                        provider_enum.as_string(),
                    )
                    .ok()
                    .filter(|key| !key.is_empty());
                    if saved.is_some() {
                        if let Err(refusal) = allow_saved_key_destination(
                            &app,
                            provider_enum,
                            base_url.as_deref(),
                            asked_by_user,
                        )
                        .await
                        {
                            state.router.write().await.remove_provider(provider_enum);
                            return Err(refusal);
                        }
                    } else {
                        awaiting_confirmation().remove(provider_enum.as_string());
                    }
                    saved
                }
            };
            let direct = DirectApiProvider::new_local_runtime(
                provider_enum,
                local_key,
                base_url,
                allow_private_network,
            )
            .map_err(|e| format!("Failed to configure {}: {}", provider, e))?;
            state
                .router
                .write()
                .await
                .set_provider(provider_enum, Box::new(direct));
            Ok(())
        }
        "managed_cloud" | "managedcloud" | "cloud" => {
            // ManagedCloud doesn't need an API key - it uses the access token from keyring
            let managed = ManagedCloudProvider::new()
                .map_err(|e| format!("Failed to create ManagedCloud provider: {}", e))?;
            state
                .router
                .write()
                .await
                .set_managed_cloud(Box::new(managed));
            Ok(())
        }
        _ => {
            // BYOK: Create a DirectApiProvider for cloud providers with user-supplied API keys.
            let provider_enum = Provider::from_string(&provider)
                .ok_or_else(|| format!("Unknown provider: {}", provider))?;

            // A key passed in this call goes where this call says. A saved
            // key goes to the provider's registered endpoint, or to another
            // address only after the user has agreed to it natively.
            let resolved_key = match api_key.filter(|k| !k.is_empty()) {
                Some(key) => {
                    awaiting_confirmation().remove(provider_enum.as_string());
                    key
                }
                None => {
                    let saved = crate::sys::commands::mcp_oauth::retrieve_api_key(
                        Some(encryption.inner()),
                        provider_enum.as_string(),
                    )
                    .map_err(|_| {
                        format!(
                            "No API key provided for '{}'. Please add your API key in Settings \u{2192} Models.",
                            provider
                        )
                    })?;
                    if let Err(refusal) = allow_saved_key_destination(
                        &app,
                        provider_enum,
                        base_url.as_deref(),
                        asked_by_user,
                    )
                    .await
                    {
                        state.router.write().await.remove_provider(provider_enum);
                        return Err(refusal);
                    }
                    saved
                }
            };

            let direct = DirectApiProvider::new(provider_enum, resolved_key, base_url)
                .map_err(|e| format!("Failed to create {} provider: {}", provider, e))?;
            state
                .router
                .write()
                .await
                .set_provider(provider_enum, Box::new(direct));

            tracing::info!(
                "Registered BYOK DirectApiProvider for '{}'",
                provider_enum.as_string()
            );
            Ok(())
        }
    }
}

/// Re-register BYOK (direct-API) providers whose encrypted keys survived from
/// a previous session.
///
/// `save_api_key`/`llm_configure_provider` only add a provider to the
/// in-memory `LLMRouter` at the moment a key is saved. Restarting the app
/// rebuilds an empty router, the frontend's settings-rehydration callback
/// (`stores/settingsStore.ts`) only re-registers the local runtimes (Ollama,
/// LM Studio, llama.cpp), never BYOK cloud providers. Without this step,
/// every configured BYOK provider (OpenRouter, OpenAI, Anthropic, ...)
/// reports `configured: false` after every restart even though its key is
/// still safely stored (encrypted) in `settings_v2`, the user would have to
/// re-paste the same key every launch with no indication why. Called once
/// from `lib.rs`'s `setup()` after the LLM router and master-password
/// encryption state exist.
pub async fn rehydrate_byok_providers(
    router: &Arc<RwLock<LLMRouter>>,
    encryption: &crate::sys::security::MasterPasswordEncryption,
) {
    let provider_ids = saved_key_provider_ids();

    for provider_id in provider_ids {
        let Some(provider_enum) = Provider::from_string(&provider_id) else {
            continue;
        };
        if !is_byok_provider(provider_enum) {
            continue;
        }

        let api_key = match crate::sys::commands::mcp_oauth::retrieve_api_key(
            Some(encryption),
            provider_enum.as_string(),
        ) {
            Ok(key) if !key.is_empty() => key,
            _ => continue,
        };

        match DirectApiProvider::new(provider_enum, api_key, None) {
            Ok(direct) => {
                router
                    .write()
                    .await
                    .set_provider(provider_enum, Box::new(direct));
                tracing::info!(
                    "BYOK rehydration: restored '{}' provider from a stored key",
                    provider_enum.as_string()
                );
            }
            Err(e) => {
                // Providers needing more than a bare key (Azure's deployment URL,
                // Bedrock's SigV4 creds) can't be rehydrated from settings_v2 alone.
                // log and continue rather than fail the whole rehydration pass.
                tracing::warn!(
                    "BYOK rehydration: could not restore '{}' provider ({}). Re-configure it in Settings \u{2192} Models & Keys.",
                    provider_enum.as_string(),
                    e
                );
            }
        }
    }
}

/// The `<provider>` of every `api_key_<provider>` row in `settings_v2`.
///
/// All keys are fetched and the prefix is filtered in Rust (rather than a SQL
/// LIKE pattern) so a literal underscore in the prefix can't be misread as
/// the SQL LIKE single-character wildcard.
fn saved_key_provider_ids() -> Vec<String> {
    match crate::core::mcp::config::open_mcp_settings_db() {
        Ok(conn) => match conn.prepare("SELECT key FROM settings_v2") {
            Ok(mut stmt) => match stmt.query_map([], |row| row.get::<_, String>(0)) {
                Ok(rows) => rows
                    .filter_map(Result::ok)
                    .filter_map(|key| key.strip_prefix("api_key_").map(str::to_string))
                    .collect::<Vec<_>>(),
                Err(e) => {
                    tracing::warn!("Failed to read stored provider keys: {}", e);
                    Vec::new()
                }
            },
            Err(e) => {
                tracing::warn!("Failed to query settings_v2 for provider keys: {}", e);
                Vec::new()
            }
        },
        Err(e) => {
            tracing::warn!("Failed to open settings DB for provider keys: {}", e);
            Vec::new()
        }
    }
}

fn saved_key_providers() -> Vec<Provider> {
    saved_key_provider_ids()
        .iter()
        .map(String::as_str)
        .filter_map(Provider::from_string)
        .filter(|provider| can_hold_saved_key(*provider))
        .collect()
}

fn remove_saved_key_providers(router: &mut LLMRouter, saved: &[Provider]) {
    for provider in saved {
        router.remove_provider(*provider);
    }
}

/// Forget every provider that was registered with a saved key, then restore
/// the ones whose key can still be read with the vault locked.
///
/// Called when the vault locks. A registered provider holds its key in
/// memory, so leaving it in the router would keep a vault-protected key
/// usable after the lock. What is left afterwards is exactly what a launch
/// with a locked vault registers: providers whose keys are not sealed under
/// the master password. The rest return on the next unlock.
pub async fn forget_locked_providers(
    router: &Arc<RwLock<LLMRouter>>,
    encryption: &crate::sys::security::MasterPasswordEncryption,
) {
    let saved = saved_key_providers();
    remove_saved_key_providers(&mut *router.write().await, &saved);
    rehydrate_byok_providers(router, encryption).await;
}

fn locked_saved_keys(encryption: &crate::sys::security::MasterPasswordEncryption) -> Vec<String> {
    if !encryption.is_configured() || encryption.is_unlocked() {
        return Vec::new();
    }
    let mut locked = saved_key_providers()
        .into_iter()
        .filter(|provider| {
            crate::sys::commands::mcp_oauth::retrieve_api_key(
                Some(encryption),
                provider.as_string(),
            )
            .is_err()
        })
        .map(|provider| provider.as_string().to_string())
        .collect::<Vec<_>>();
    locked.sort();
    locked.dedup();
    locked
}

/// Providers whose saved key is sealed under the master password and cannot
/// be used until the vault is unlocked, so Settings can say "locked" instead
/// of "not configured". Empty when no master password is set or the vault is
/// open.
#[tauri::command]
pub async fn llm_list_locked_api_keys(
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<Vec<String>, String> {
    Ok(locked_saved_keys(encryption.inner()))
}

/// Providers whose requests leave the device with the user's own key. Ollama
/// and the other Local runtimes take no key, and Managed Cloud authenticates
/// with the account token, so none of them is ever a BYOK key row.
fn is_byok_provider(provider: Provider) -> bool {
    !matches!(
        provider,
        Provider::Ollama
            | Provider::ManagedCloud
            | Provider::LmStudio
            | Provider::LlamaCpp
            | Provider::Vllm
    )
}

/// Providers that can hold a key saved on this device: every BYOK provider,
/// and LM Studio, llama.cpp and vLLM, whose servers can be started with one.
/// Ollama takes no key and Managed Cloud uses the account token.
fn can_hold_saved_key(provider: Provider) -> bool {
    !matches!(provider, Provider::Ollama | Provider::ManagedCloud)
}

/// Providers with an API key saved on this device, so Settings can show them
/// as configured after a restart. The keys themselves are never returned.
#[tauri::command]
pub async fn llm_list_saved_api_keys() -> Result<Vec<String>, String> {
    let conn = crate::core::mcp::config::open_mcp_settings_db()?;
    let mut stmt = conn
        .prepare("SELECT key FROM settings_v2")
        .map_err(|e| format!("Failed to read saved provider keys: {}", e))?;
    let mut providers = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to read saved provider keys: {}", e))?
        .filter_map(Result::ok)
        .filter_map(|key| key.strip_prefix("api_key_").and_then(Provider::from_string))
        .filter(|provider| can_hold_saved_key(*provider))
        .map(|provider| provider.as_string().to_string())
        .collect::<Vec<_>>();
    providers.sort();
    providers.dedup();
    Ok(providers)
}

/// Delete a saved provider key and stop routing to that provider at once.
/// BYOK chats that used it keep their history but cannot send until a key is
/// saved again.
#[tauri::command]
pub async fn llm_delete_api_key(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<(), String> {
    let provider_enum = Provider::from_string(&provider)
        .filter(|candidate| can_hold_saved_key(*candidate))
        .ok_or_else(|| format!("'{}' has no API key to remove", provider))?;
    let mut setting_keys = vec![format!("api_key_{}", provider_enum.as_string())];
    if provider != provider_enum.as_string() {
        setting_keys.push(format!("api_key_{}", provider));
    }
    {
        let conn = crate::core::mcp::config::open_mcp_settings_db()?;
        for setting_key in setting_keys {
            conn.execute(
                "DELETE FROM settings_v2 WHERE key = ?1",
                rusqlite::params![setting_key],
            )
            .map_err(|e| {
                format!(
                    "Failed to remove the {} key: {}",
                    provider_enum.as_string(),
                    e
                )
            })?;
        }
        forget_saved_key_destinations(&conn, provider_enum)?;
    }
    awaiting_confirmation().remove(provider_enum.as_string());
    state.router.write().await.remove_provider(provider_enum);
    tracing::info!("Removed the saved key for '{}'", provider_enum.as_string());
    Ok(())
}

const MAX_BYOK_FORK_MESSAGES: usize = 1000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokForkMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokForkRequest {
    pub user_id: String,
    pub title: String,
    #[serde(default)]
    pub project_id: Option<String>,
    pub messages: Vec<ByokForkMessage>,
}

/// Store a consented Local-to-BYOK fork as its own BYOK conversation and
/// return its id. Only the context the user approved in the fork dialog
/// arrives here, already redacted; the Local conversation it came from is not
/// touched (AGENTS.md section 6).
#[tauri::command]
pub fn llm_create_byok_fork(
    db: State<'_, AppDatabase>,
    request: ByokForkRequest,
) -> Result<i64, String> {
    let conn = db.connection()?;
    create_byok_fork(&conn, &request)
}

fn create_byok_fork(conn: &rusqlite::Connection, request: &ByokForkRequest) -> Result<i64, String> {
    use crate::data::db::models::{Message, MessageRole};
    use crate::data::db::repository;

    let user_id = request.user_id.trim();
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    if request.messages.is_empty() {
        return Err("A BYOK fork needs at least one approved message".to_string());
    }
    if request.messages.len() > MAX_BYOK_FORK_MESSAGES {
        return Err(format!(
            "A BYOK fork can carry at most {} messages",
            MAX_BYOK_FORK_MESSAGES
        ));
    }
    let roles = request
        .messages
        .iter()
        .map(|message| match message.role.as_str() {
            "user" => Ok(MessageRole::User),
            "assistant" => Ok(MessageRole::Assistant),
            other => Err(format!(
                "Unsupported message role '{}' in a BYOK fork",
                other
            )),
        })
        .collect::<Result<Vec<_>, _>>()?;
    let title = match request.title.trim() {
        "" => "BYOK fork",
        title => title,
    };

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let conversation_id = repository::create_conversation_with_execution_mode(
        &tx,
        title.to_string(),
        user_id.to_string(),
        "local",
        crate::sys::commands::chat::ChatExecutionMode::Byok.as_str(),
        request.project_id.as_deref(),
    )
    .map_err(|e| format!("Failed to create the BYOK conversation: {e}"))?;
    for (message, role) in request.messages.iter().zip(roles) {
        repository::insert_message(
            &tx,
            &Message::new(
                conversation_id,
                user_id.to_string(),
                role,
                message.content.clone(),
            ),
        )
        .map_err(|e| format!("Failed to copy approved context into the fork: {e}"))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(conversation_id)
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

/// Keep the router's ManagedCloud registration equal to "the app is in Cloud
/// mode and signed in". Outside that state the provider is removed, so a mode
/// switch or a sign-out leaves nothing that could carry the account token.
/// Returns whether the provider is registered afterwards.
pub(crate) async fn reconcile_managed_cloud_provider(router: &RwLock<LLMRouter>) -> bool {
    // The mode and credential are read under the router lock, so concurrent
    // reconciliations apply in order and the last one reflects the live mode.
    let mut router = router.write().await;
    let provider = if crate::sys::account::get_access_token().is_ok() {
        ManagedCloudProvider::new().ok()
    } else {
        None
    };
    match provider {
        Some(provider) => {
            router.set_managed_cloud(Box::new(provider));
            true
        }
        None => {
            router.remove_provider(Provider::ManagedCloud);
            false
        }
    }
}

/// Register ManagedCloud for a signed-in Cloud session, and remove it in any
/// other state.
#[tauri::command]
pub async fn llm_ensure_managed_cloud(state: State<'_, LLMState>) -> Result<bool, String> {
    Ok(reconcile_managed_cloud_provider(&state.router).await)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub available: bool,
    #[serde(
        rename = "runtimeCapabilities",
        skip_serializing_if = "Option::is_none"
    )]
    pub runtime_capabilities: Option<RuntimeModelCapabilities>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeModelCapabilities {
    pub tools: bool,
    pub vision: bool,
    pub thinking: bool,
    pub context_window: usize,
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
    /// The address this provider's saved key would be sent to, when it is not
    /// connected because the user has not agreed to that yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub saved_key_awaits_confirmation: Option<String>,
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

/// A catalog model is selectable only when its own provider route is
/// configured. Managed Cloud is a separate trust boundary and must never make
/// direct OpenAI, Anthropic, Google, or other BYOK routes appear available.
fn catalog_provider_is_available(router: &LLMRouter, provider: Provider) -> bool {
    router.has_provider(provider)
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
            runtime_capabilities: None,
        })
        .collect();

    let mut available_models = Vec::new();

    for mut model in all_models {
        let provider_enum = match Provider::from_string(&model.provider) {
            Some(p) => p,
            None => continue,
        };

        if catalog_provider_is_available(&router, provider_enum) {
            model.available = true;
            available_models.push(model);
        }
    }

    if router.has_provider(Provider::Ollama) {
        match list_ollama_models_internal(&local_runtime_base_url(&router, Provider::Ollama)).await
        {
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

    // LM Studio / llama.cpp / vLLM: same dynamic-discovery pattern as Ollama above.
    // only shown when the local server is actually reachable and reports installed
    // models (never a fake availability badge).
    if router.has_provider(Provider::LmStudio) {
        match list_local_runtime_models(
            &local_runtime_base_url(&router, Provider::LmStudio),
            Provider::LmStudio,
        )
        .await
        {
            Ok(models) => {
                if !models.is_empty() {
                    available_models.extend(models);
                }
            }
            Err(e) => tracing::debug!("LM Studio not available: {}", e),
        }
    }

    if router.has_provider(Provider::LlamaCpp) {
        match list_local_runtime_models(
            &local_runtime_base_url(&router, Provider::LlamaCpp),
            Provider::LlamaCpp,
        )
        .await
        {
            Ok(models) => {
                if !models.is_empty() {
                    available_models.extend(models);
                }
            }
            Err(e) => tracing::debug!("llama.cpp not available: {}", e),
        }
    }

    if router.has_provider(Provider::Vllm) {
        match list_local_runtime_models(
            &local_runtime_base_url(&router, Provider::Vllm),
            Provider::Vllm,
        )
        .await
        {
            Ok(models) => {
                if !models.is_empty() {
                    available_models.extend(models);
                }
            }
            Err(e) => tracing::debug!("vLLM not available: {}", e),
        }
    }

    // OpenRouter: live catalog supplements (never replaces) the small curated
    // free-tier set already added above from the static JSON catalog.
    // OpenRouter proxies hundreds of models across many underlying providers,
    // which can't reasonably be hand-curated. Only fetched once a key is
    // configured, both for network hygiene (no background calls to a third
    // party for users who haven't opted into OpenRouter) and because listing
    // models a user can't actually call would be misleading.
    if router.has_provider(Provider::OpenRouter) {
        match llm_list_openrouter_models().await {
            Ok(models) => {
                let existing_ids: std::collections::HashSet<String> =
                    available_models.iter().map(|m| m.id.clone()).collect();
                available_models
                    .extend(models.into_iter().filter(|m| !existing_ids.contains(&m.id)));
            }
            Err(e) => tracing::debug!("OpenRouter live model list unavailable: {}", e),
        }
    }

    Ok(available_models)
}

#[tauri::command]
pub async fn llm_check_provider_status(
    provider: String,
    state: State<'_, LLMState>,
) -> Result<ProviderStatus, String> {
    if let Some(destination) =
        Provider::from_string(&provider).and_then(saved_key_awaits_confirmation)
    {
        return Ok(ProviderStatus {
            provider,
            available: false,
            configured: false,
            error: Some(reconnect_to_confirm_message(&destination)),
            rate_limit_remaining: None,
            rate_limit_reset: None,
            ollama_running: None,
            saved_key_awaits_confirmation: Some(destination),
        });
    }

    let router = state.router.read().await;

    // Local runtimes (Ollama, LM Studio, llama.cpp, vLLM) are "available" purely
    // based on whether the local server responds, they never require an API key.
    let is_local_runtime = matches!(
        provider.as_str(),
        "ollama" | "lmstudio" | "llamacpp" | "vllm"
    );
    let local_runtime_label = match provider.as_str() {
        "ollama" => "Ollama",
        "lmstudio" => "LM Studio",
        "llamacpp" => "llama.cpp",
        "vllm" => "vLLM",
        _ => "",
    };

    let mut ollama_running = None;
    if provider == "ollama" {
        let client = create_llm_command_client(5)?;
        match client
            .get(format!(
                "{}/api/tags",
                local_runtime_base_url(&router, Provider::Ollama)
            ))
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
    } else if provider == "lmstudio" || provider == "llamacpp" || provider == "vllm" {
        let runtime = match provider.as_str() {
            "lmstudio" => Provider::LmStudio,
            "llamacpp" => Provider::LlamaCpp,
            _ => Provider::Vllm,
        };
        let base_url = local_runtime_base_url(&router, runtime);
        let client = create_llm_command_client(5)?;
        match client
            .get(format!("{}/models", base_url))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            Ok(response) => {
                ollama_running = Some(response.status().is_success());
            }
            Err(_) => {
                ollama_running = Some(false);
            }
        }
    }

    let provider_enum = resolve_provider_for_routing(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    let managed_cloud_available = router.has_provider(Provider::ManagedCloud);
    let configured = if is_local_runtime {
        ollama_running.unwrap_or(false)
    } else {
        match provider_enum {
            Provider::ManagedCloud => managed_cloud_available,
            _ => router.has_provider(provider_enum),
        }
    };

    let available = if is_local_runtime {
        ollama_running.unwrap_or(false)
    } else {
        configured
    };

    Ok(ProviderStatus {
        provider: provider.clone(),
        available,
        configured,
        error: if !configured && !is_local_runtime {
            Some("Provider not configured. Add your API key in Settings \u{2192} Models, or sign in to use Managed Cloud.".to_string())
        } else if provider == "ollama" && !ollama_running.unwrap_or(false) {
            Some("Ollama server is not running. Start with 'ollama serve'".to_string())
        } else if is_local_runtime && !ollama_running.unwrap_or(false) {
            Some(format!("{} server is not running.", local_runtime_label))
        } else {
            None
        },
        rate_limit_remaining: None,
        rate_limit_reset: None,
        ollama_running,
        saved_key_awaits_confirmation: None,
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

/// List the models installed in the Ollama server chat is configured to use.
#[tauri::command]
pub async fn llm_list_ollama_models(state: State<'_, LLMState>) -> Result<Vec<ModelInfo>, String> {
    let base_url = local_runtime_base_url(&*state.router.read().await, Provider::Ollama);
    list_ollama_models_internal(&base_url).await
}

async fn list_ollama_models_internal(base_url: &str) -> Result<Vec<ModelInfo>, String> {
    let client = create_llm_command_client(10)?;
    let response = client
        .get(format!("{}/api/tags", base_url))
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

    let mut models = Vec::with_capacity(tags_response.models.len());
    for model in tags_response.models {
        let details = model.details.as_ref();
        let detail_label = [
            details.and_then(|value| value.parameter_size.clone()),
            details.and_then(|value| value.quantization_level.clone()),
            details.and_then(|value| value.family.clone()),
        ]
        .into_iter()
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        let capabilities = crate::core::llm::capability_detection::detect_ollama_capabilities(
            &client,
            base_url,
            &model.name,
        )
        .await;

        models.push(ModelInfo {
            id: model.name.clone(),
            name: if detail_label.is_empty() {
                model.name
            } else {
                format!("{} ({})", model.name, detail_label)
            },
            provider: "ollama".to_string(),
            available: true,
            runtime_capabilities: Some(RuntimeModelCapabilities {
                tools: capabilities.supports_tools,
                vision: capabilities.supports_vision,
                thinking: capabilities.supports_thinking,
                context_window: capabilities.context_length,
            }),
        });
    }

    Ok(models)
}

// --- LM Studio / llama.cpp / vLLM model listing -----------------------------
//
// All three expose an OpenAI-compatible `GET /v1/models` endpoint returning
// `{"data": [{"id": "..."}, ...]}`, unlike Ollama's `/api/tags` shape, so this
// is intentionally NOT a copy of `list_ollama_models_internal`. One shared
// parser is used for all three providers since the wire format is identical.

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAICompatModel {
    id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAICompatModelsResponse {
    #[serde(default)]
    data: Vec<OpenAICompatModel>,
}

/// Shared implementation for listing models from an OpenAI-compatible local
/// runtime's `/v1/models` endpoint. `base_url` must already include any `/v1`
/// suffix (e.g. `http://localhost:1234/v1`).
async fn list_openai_compat_models_internal(
    base_url: &str,
    provider: Provider,
    display_name: &str,
) -> Result<Vec<ModelInfo>, String> {
    let client = create_llm_command_client(10)?;

    let response = client
        .get(format!("{}/models", base_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to {}: {}", display_name, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "{} API returned error: {}",
            display_name,
            response.status()
        ));
    }

    let parsed: OpenAICompatModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse {} response: {}", display_name, e))?;

    let provider_id = provider.as_string().to_string();
    Ok(parsed
        .data
        .into_iter()
        .map(|m| ModelInfo {
            id: m.id.clone(),
            name: m.id,
            provider: provider_id.clone(),
            available: true,
            runtime_capabilities: None,
        })
        .collect())
}

/// List models served by an OpenAI-compatible Local runtime at the URL chat
/// uses. Returns `Err` when the server is not reachable there; callers must not
/// synthesize a fallback list.
async fn list_local_runtime_models(
    base_url: &str,
    provider: Provider,
) -> Result<Vec<ModelInfo>, String> {
    let label = local_runtime_label(provider)
        .ok_or_else(|| format!("{} is not a Local runtime", provider.as_string()))?;
    list_openai_compat_models_internal(base_url, provider, label).await
}

async fn list_registered_local_runtime_models(
    state: &LLMState,
    provider: Provider,
) -> Result<Vec<ModelInfo>, String> {
    let base_url = local_runtime_base_url(&*state.router.read().await, provider);
    list_local_runtime_models(&base_url, provider).await
}

#[tauri::command]
pub async fn llm_list_lmstudio_models(
    state: State<'_, LLMState>,
) -> Result<Vec<ModelInfo>, String> {
    list_registered_local_runtime_models(&state, Provider::LmStudio).await
}

#[tauri::command]
pub async fn llm_list_llamacpp_models(
    state: State<'_, LLMState>,
) -> Result<Vec<ModelInfo>, String> {
    list_registered_local_runtime_models(&state, Provider::LlamaCpp).await
}

#[tauri::command]
pub async fn llm_list_vllm_models(state: State<'_, LLMState>) -> Result<Vec<ModelInfo>, String> {
    list_registered_local_runtime_models(&state, Provider::Vllm).await
}

const LMSTUDIO_MANAGEMENT_UNAVAILABLE: &str = "This LM Studio server has no model management API. Loading and unloading models from here needs LM Studio 0.4.0 or newer.";
const LMSTUDIO_LIST_TIMEOUT_SECS: u64 = 10;
const LMSTUDIO_UNLOAD_TIMEOUT_SECS: u64 = 60;
const LMSTUDIO_LOAD_TIMEOUT_SECS: u64 = 600;
const LMSTUDIO_CHAT_MODEL_KIND: &str = "llm";

/// A chat model LM Studio has on disk, with the instances of it that are in
/// memory, from LM Studio's `GET /api/v1/models`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LmStudioModelState {
    pub key: String,
    pub display_name: String,
    pub size_bytes: u64,
    pub loaded_instance_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LmStudioModelsResponse {
    #[serde(default)]
    models: Vec<LmStudioModelEntry>,
}

#[derive(Debug, Deserialize)]
struct LmStudioModelEntry {
    key: String,
    #[serde(default, rename = "type")]
    kind: String,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    size_bytes: u64,
    #[serde(default)]
    loaded_instances: Vec<LmStudioLoadedInstance>,
}

#[derive(Debug, Deserialize)]
struct LmStudioLoadedInstance {
    id: String,
}

fn lmstudio_model_states(response: LmStudioModelsResponse) -> Vec<LmStudioModelState> {
    response
        .models
        .into_iter()
        .filter(|model| model.kind == LMSTUDIO_CHAT_MODEL_KIND)
        .map(|model| LmStudioModelState {
            display_name: model
                .display_name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| model.key.clone()),
            key: model.key,
            size_bytes: model.size_bytes,
            loaded_instance_ids: model
                .loaded_instances
                .into_iter()
                .map(|instance| instance.id)
                .collect(),
        })
        .collect()
}

/// LM Studio serves chat at `<root>/v1` and model management at
/// `<root>/api/v1`, so the management root is the chat URL without `/v1`.
fn lmstudio_management_root(chat_base_url: &str) -> String {
    let trimmed = chat_base_url.trim().trim_end_matches('/');
    trimmed.strip_suffix("/v1").unwrap_or(trimmed).to_string()
}

async fn lmstudio_management_request(
    state: &LLMState,
    encryption: &crate::sys::security::MasterPasswordEncryption,
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
    timeout_secs: u64,
) -> Result<reqwest::Response, String> {
    let server_key = crate::sys::commands::mcp_oauth::retrieve_api_key(
        Some(encryption),
        Provider::LmStudio.as_string(),
    )
    .ok()
    .filter(|key| !key.is_empty());
    let root = lmstudio_management_root(&local_runtime_base_url(
        &*state.router.read().await,
        Provider::LmStudio,
    ));

    let client = create_llm_command_client(timeout_secs)?;
    let mut request = client.request(method, format!("{root}/api/v1/{path}"));
    if let Some(key) = server_key {
        request = request.bearer_auth(key);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    request
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LM Studio: {e}"))
}

async fn lmstudio_failure(response: reqwest::Response) -> String {
    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    format!("LM Studio returned {status}: {}", detail.trim())
}

/// List LM Studio's chat models and which of them are in memory.
#[tauri::command]
pub async fn llm_lmstudio_list_model_states(
    state: State<'_, LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<Vec<LmStudioModelState>, String> {
    let response = lmstudio_management_request(
        &state,
        encryption.inner(),
        reqwest::Method::GET,
        "models",
        None,
        LMSTUDIO_LIST_TIMEOUT_SECS,
    )
    .await?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(LMSTUDIO_MANAGEMENT_UNAVAILABLE.to_string());
    }
    if !response.status().is_success() {
        return Err(lmstudio_failure(response).await);
    }

    let parsed: LmStudioModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse the LM Studio model list: {e}"))?;
    Ok(lmstudio_model_states(parsed))
}

/// Load a model into LM Studio's memory.
#[tauri::command]
pub async fn llm_lmstudio_load_model(
    model: String,
    state: State<'_, LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<(), String> {
    if model.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let response = lmstudio_management_request(
        &state,
        encryption.inner(),
        reqwest::Method::POST,
        "models/load",
        Some(serde_json::json!({ "model": model.trim() })),
        LMSTUDIO_LOAD_TIMEOUT_SECS,
    )
    .await?;

    if !response.status().is_success() {
        return Err(lmstudio_failure(response).await);
    }
    Ok(())
}

/// Unload one loaded instance from LM Studio's memory.
#[tauri::command]
pub async fn llm_lmstudio_unload_model(
    instance_id: String,
    state: State<'_, LLMState>,
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
) -> Result<(), String> {
    if instance_id.trim().is_empty() {
        return Err("Model instance cannot be empty".to_string());
    }
    let response = lmstudio_management_request(
        &state,
        encryption.inner(),
        reqwest::Method::POST,
        "models/unload",
        Some(serde_json::json!({ "instance_id": instance_id.trim() })),
        LMSTUDIO_UNLOAD_TIMEOUT_SECS,
    )
    .await?;

    if !response.status().is_success() {
        return Err(lmstudio_failure(response).await);
    }
    Ok(())
}

// --- OpenRouter live model catalog ------------------------------------------
//
// OpenRouter is a BYOK gateway proxying hundreds of models across many
// underlying providers, the small hand-curated set in
// `packages/ai/model-registry/catalog/models.curation.json` (a handful of free-tier models)
// can't reasonably represent that whole catalog. This fetches OpenRouter's
// public `/api/v1/models` list live and supplements (never replaces) the
// curated entries in `llm_get_available_models`. Reference implementation
// already shipped in `apps/cli/src/models/openrouter_models.rs`: that GET
// requires no auth header (it's a public catalog listing, unlike chat
// completions), so this mirrors it rather than sending a bearer token that
// could turn an invalid/expired key into a spurious 401 on a request that
// doesn't need auth at all.

#[derive(Debug, Clone, Deserialize)]
struct OpenRouterArchitecture {
    #[serde(default)]
    output_modalities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenRouterModelEntry {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    architecture: Option<OpenRouterArchitecture>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenRouterModelsResponse {
    #[serde(default)]
    data: Vec<OpenRouterModelEntry>,
}

/// Maps one OpenRouter `/models` catalog entry into a `ModelInfo`, or `None`
/// if it isn't usable as a normal chat model. OpenRouter's catalog mixes
/// chat models with pure media-output generators (image/audio/video) that
/// would fail if selected from the chat model picker.
fn map_openrouter_entry(entry: &OpenRouterModelEntry) -> Option<ModelInfo> {
    let id = entry.id.trim();
    if id.is_empty() {
        return None;
    }
    let outputs_media = entry
        .architecture
        .as_ref()
        .map(|a| {
            a.output_modalities
                .iter()
                .any(|m| matches!(m.as_str(), "audio" | "image" | "video"))
        })
        .unwrap_or(false);
    if outputs_media {
        return None;
    }
    Some(ModelInfo {
        id: id.to_string(),
        name: entry.name.clone().unwrap_or_else(|| id.to_string()),
        provider: Provider::OpenRouter.as_string().to_string(),
        available: true,
        runtime_capabilities: None,
    })
}

/// Shared implementation: fetch and map OpenRouter's live model catalog.
async fn list_openrouter_models_internal() -> Result<Vec<ModelInfo>, String> {
    let client = create_llm_command_client(10)?;

    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OpenRouter: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "OpenRouter model list request failed ({}): {}",
            status,
            body.chars().take(300).collect::<String>()
        ));
    }

    let parsed: OpenRouterModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenRouter models response: {}", e))?;

    Ok(parsed
        .data
        .iter()
        .filter_map(map_openrouter_entry)
        .collect())
}

/// List OpenRouter's live model catalog (`GET /api/v1/models`). Unlike the
/// local-runtime listers above, callers should only invoke this once an
/// OpenRouter API key is configured (BYOK), see the `has_provider` gate in
/// `llm_get_available_models`, even though the endpoint itself is public,
/// so the app doesn't make background egress calls to a third party for
/// users who never opted into OpenRouter.
pub async fn llm_list_openrouter_models() -> Result<Vec<ModelInfo>, String> {
    list_openrouter_models_internal().await
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

/// Reset the session cost accumulator to zero.
///
/// The LLM router tracks cumulative cost across all invocations in a session.
/// Once it hits `SESSION_COST_SAFETY_CAP` it refuses new requests. This command
/// lets the frontend (or user) reset the counter, e.g. at conversation start or
/// when the user explicitly acknowledges the spend.
#[tauri::command]
pub async fn reset_session_cost(state: State<'_, LLMState>) -> Result<(), String> {
    let router = state.router.read().await;
    router.reset_cumulative_cost();
    tracing::info!("Session cost accumulator reset to zero");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::LLMProvider;
    use std::error::Error;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn openai_catalog_model() -> String {
        crate::core::llm::models_config::get_default_model(&Provider::OpenAI).to_string()
    }

    struct MockProvider {
        calls: Arc<AtomicUsize>,
    }

    #[async_trait::async_trait]
    impl LLMProvider for MockProvider {
        async fn send_message(
            &self,
            request: &LLMRequest,
        ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(LLMResponse {
                content: format!("echo: {}", request.messages[0].content),
                model: request.model.clone(),
                cached: false,
                tokens: Some(12),
                prompt_tokens: Some(7),
                completion_tokens: Some(5),
                cost: Some(0.01),
                ..Default::default()
            })
        }

        fn is_configured(&self) -> bool {
            true
        }

        fn name(&self) -> &str {
            "mock"
        }
    }

    #[test]
    fn locking_forgets_providers_registered_from_a_saved_key_and_keeps_the_rest() {
        let mut router = LLMRouter::new();
        for provider in [Provider::OpenAI, Provider::LmStudio, Provider::Anthropic] {
            router.set_provider(
                provider,
                Box::new(MockProvider {
                    calls: Arc::new(AtomicUsize::new(0)),
                }),
            );
        }

        remove_saved_key_providers(&mut router, &[Provider::OpenAI, Provider::LmStudio]);

        assert!(!router.has_provider(Provider::OpenAI));
        assert!(!router.has_provider(Provider::LmStudio));
        assert!(router.has_provider(Provider::Anthropic));
    }

    #[test]
    fn nothing_is_reported_locked_without_a_locked_vault() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let manager =
            crate::sys::security::MasterPasswordManager::new(Arc::new(std::sync::Mutex::new(conn)));
        manager.init_table().unwrap();
        let manager = Arc::new(std::sync::Mutex::new(manager));
        let encryption = crate::sys::security::MasterPasswordEncryption::new(manager.clone());

        assert!(locked_saved_keys(&encryption).is_empty());

        manager
            .lock()
            .unwrap()
            .setup("Alpha-Beta-Unique-Phrase-9") // gitleaks:allow
            .unwrap();
        assert!(encryption.is_unlocked());
        assert!(locked_saved_keys(&encryption).is_empty());
    }

    #[test]
    fn lmstudio_management_root_drops_the_chat_suffix() {
        assert_eq!(
            lmstudio_management_root("http://localhost:1234/v1"),
            "http://localhost:1234"
        );
        assert_eq!(
            lmstudio_management_root("http://localhost:1234/v1/"),
            "http://localhost:1234"
        );
        assert_eq!(
            lmstudio_management_root("http://192.168.1.20:1234"),
            "http://192.168.1.20:1234"
        );
    }

    #[test]
    fn lmstudio_model_states_list_chat_models_and_their_loaded_instances() {
        let parsed: LmStudioModelsResponse = serde_json::from_value(serde_json::json!({
            "models": [
                {
                    "type": "llm",
                    "key": "fixture/chat-model",
                    "display_name": "Fixture Chat",
                    "size_bytes": 17_990_911_801_u64,
                    "loaded_instances": [{ "id": "fixture/chat-model", "config": { "context_length": 4096 } }]
                },
                {
                    "type": "llm",
                    "key": "fixture/idle-model",
                    "display_name": "",
                    "size_bytes": 1_000,
                    "loaded_instances": []
                },
                {
                    "type": "embedding",
                    "key": "fixture/embedding-model",
                    "display_name": "Fixture Embedding",
                    "size_bytes": 2_000,
                    "loaded_instances": []
                }
            ]
        }))
        .unwrap();

        assert_eq!(
            lmstudio_model_states(parsed),
            vec![
                LmStudioModelState {
                    key: "fixture/chat-model".to_string(),
                    display_name: "Fixture Chat".to_string(),
                    size_bytes: 17_990_911_801,
                    loaded_instance_ids: vec!["fixture/chat-model".to_string()],
                },
                LmStudioModelState {
                    key: "fixture/idle-model".to_string(),
                    display_name: "fixture/idle-model".to_string(),
                    size_bytes: 1_000,
                    loaded_instance_ids: Vec::new(),
                },
            ]
        );
    }

    #[test]
    fn managed_cloud_registration_does_not_advertise_unconfigured_byok_providers() {
        let mut router = LLMRouter::new();
        router.set_managed_cloud(Box::new(MockProvider {
            calls: Arc::new(AtomicUsize::new(0)),
        }));

        assert!(catalog_provider_is_available(
            &router,
            Provider::ManagedCloud
        ));
        assert!(
            !catalog_provider_is_available(&router, Provider::OpenAI),
            "ManagedCloud must not make an unconfigured OpenAI BYOK route appear available"
        );
        assert!(
            !catalog_provider_is_available(&router, Provider::Anthropic),
            "ManagedCloud must not make an unconfigured Anthropic BYOK route appear available"
        );
    }

    #[test]
    fn direct_llm_command_builds_plain_non_tool_request() {
        let request = LLMSendMessageRequest {
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "Clean up voice dictation only.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "um write this better".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
            ],
            model: Some("fixture-direct-model".to_string()),
            provider: Some("openai".to_string()),
            temperature: Some(0.2),
            max_tokens: Some(500),
            prefer_cloud_credits: false,
            trust_mode: None,
        };

        let llm_request = build_plain_llm_request(&request, "fixture-direct-model".to_string());

        assert_eq!(llm_request.model, "fixture-direct-model");
        assert_eq!(llm_request.messages.len(), 2);
        assert_eq!(llm_request.temperature, Some(0.2));
        assert_eq!(llm_request.max_tokens, Some(500));
        assert!(!llm_request.stream);
        assert!(llm_request.tools.is_none());
        assert!(llm_request.tool_choice.is_none());
        assert!(llm_request.thinking_mode.is_none());
    }

    #[test]
    fn direct_llm_command_deserializes_explicit_managed_trust_boundary() {
        let request: LLMSendMessageRequest = serde_json::from_value(serde_json::json!({
            "messages": [],
            "provider": "managed_cloud",
            "prefer_cloud_credits": true,
            "trust_mode": "managed"
        }))
        .expect("managed trust mode should deserialize");

        assert_eq!(
            request.trust_mode,
            Some(agiworkforce_model_registry::TrustMode::ManagedCloud)
        );
    }

    fn helper_request(
        provider: &str,
        trust_mode: Option<agiworkforce_model_registry::TrustMode>,
    ) -> LLMSendMessageRequest {
        LLMSendMessageRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "um clean this up".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: None,
            provider: Some(provider.to_string()),
            temperature: None,
            max_tokens: Some(64),
            prefer_cloud_credits: false,
            trust_mode,
        }
    }

    async fn router_with_only_managed_cloud(calls: &Arc<AtomicUsize>) -> RwLock<LLMRouter> {
        let router = RwLock::new(LLMRouter::new());
        router
            .write()
            .await
            .set_managed_cloud(Box::new(MockProvider {
                calls: calls.clone(),
            }));
        router
    }

    #[tokio::test]
    async fn a_local_or_byok_helper_request_for_an_unconfigured_provider_never_reaches_managed_cloud(
    ) {
        use agiworkforce_model_registry::TrustMode;

        let _mode = crate::sys::account::app_mode::AppModeTestGuard::local().await;
        let managed_calls = Arc::new(AtomicUsize::new(0));
        let router = router_with_only_managed_cloud(&managed_calls).await;

        for trust_mode in [None, Some(TrustMode::Local), Some(TrustMode::Byok)] {
            let error = route_plain_llm_request(&router, helper_request("anthropic", trust_mode))
                .await
                .expect_err("an unconfigured provider leaves no candidate inside the boundary");
            assert!(
                error.starts_with(NO_CANDIDATES_ERROR_CODE),
                "trust mode {trust_mode:?} must end with no candidates, got: {error}"
            );
        }

        assert_eq!(
            managed_calls.load(Ordering::SeqCst),
            0,
            "a Local or BYOK helper request must never invoke Managed Cloud"
        );
    }

    #[tokio::test]
    async fn a_managed_helper_request_is_what_the_redirect_serves() {
        use agiworkforce_model_registry::TrustMode;

        let _mode = crate::sys::account::app_mode::AppModeTestGuard::cloud().await;
        let managed_calls = Arc::new(AtomicUsize::new(0));
        let router = router_with_only_managed_cloud(&managed_calls).await;

        let response = route_plain_llm_request(
            &router,
            helper_request("anthropic", Some(TrustMode::ManagedCloud)),
        )
        .await
        .expect("a Managed Cloud request may be served by Managed Cloud");

        assert_eq!(response.content, "echo: um clean this up");
        assert_eq!(managed_calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_local_process_refuses_a_helper_request_that_names_managed_cloud() {
        let _mode = crate::sys::account::app_mode::AppModeTestGuard::local().await;
        let managed_calls = Arc::new(AtomicUsize::new(0));
        let router = router_with_only_managed_cloud(&managed_calls).await;

        let error = route_plain_llm_request(
            &router,
            helper_request(
                "managed_cloud",
                Some(agiworkforce_model_registry::TrustMode::ManagedCloud),
            ),
        )
        .await
        .expect_err("a Local process must not serve a Managed Cloud request");

        assert_eq!(error, crate::sys::account::app_mode::LOCAL_MODE_REFUSAL);
        assert_eq!(managed_calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn leaving_cloud_removes_the_managed_cloud_provider_from_the_router() {
        let _mode = crate::sys::account::app_mode::AppModeTestGuard::local().await;
        let router = router_with_only_managed_cloud(&Arc::new(AtomicUsize::new(0))).await;
        assert!(router.read().await.has_provider(Provider::ManagedCloud));

        let registered = reconcile_managed_cloud_provider(&router).await;

        assert!(!registered);
        assert!(!router.read().await.has_provider(Provider::ManagedCloud));
    }

    #[tokio::test]
    async fn test_llm_state_with_cache_serves_second_response_from_cache() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::data::db::migrations::run_migrations(&conn).unwrap();
        let db = Arc::new(std::sync::Mutex::new(conn));

        let state = LLMState::with_cache(db.clone()).await;
        let calls = Arc::new(AtomicUsize::new(0));

        {
            let mut router = state.router.write().await;
            router.set_provider(
                Provider::OpenAI,
                Box::new(MockProvider {
                    calls: calls.clone(),
                }),
            );
        }

        let model = openai_catalog_model();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "cache me".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: model.clone(),
            temperature: Some(0.0),
            max_tokens: Some(32),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let preferences = RouterPreferences {
            provider: Some(Provider::OpenAI),
            model: Some(model),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
            local_only: false,
            managed_cloud_only: false,
            // Test exercises OpenAI (a Byok provider); `effective_trust_mode`
            // now fails closed to Local when this is None, which would make
            // `candidates()` reject OpenAI. Set explicitly so the cache test
            // still exercises real candidate selection.
            trust_mode: Some(agiworkforce_model_registry::TrustMode::Byok),
        };

        let candidate = {
            let router = state.router.read().await;
            router.candidates(&request, &preferences).remove(0)
        };

        let first = {
            let router = state.router.read().await;
            router.invoke_candidate(&candidate, &request).await.unwrap()
        };
        assert!(!first.response.cached);
        assert_eq!(first.cost, 0.01);

        let second = {
            let router = state.router.read().await;
            router.invoke_candidate(&candidate, &request).await.unwrap()
        };
        assert!(second.response.cached);
        assert_eq!(second.response.cost, Some(0.0));
        assert_eq!(second.cost, 0.0);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    // --- OpenRouter live model catalog -----------------------------------

    fn openrouter_entry(json: serde_json::Value) -> OpenRouterModelEntry {
        serde_json::from_value(json).expect("test fixture should deserialize")
    }

    #[test]
    fn map_openrouter_entry_maps_id_and_name() {
        let entry = openrouter_entry(serde_json::json!({
            "id": "fixture-provider/fixture-chat-model:free",
            "name": "Fixture Catalog Model (Free)",
        }));
        let model = map_openrouter_entry(&entry).expect("should map");
        assert_eq!(model.id, "fixture-provider/fixture-chat-model:free");
        assert_eq!(model.name, "Fixture Catalog Model (Free)");
        assert_eq!(model.provider, "open_router");
        assert!(model.available);
    }

    #[test]
    fn map_openrouter_entry_falls_back_to_id_when_name_missing() {
        let entry = openrouter_entry(serde_json::json!({ "id": "vendor/some-model" }));
        let model = map_openrouter_entry(&entry).expect("should map");
        assert_eq!(model.name, "vendor/some-model");
    }

    #[test]
    fn map_openrouter_entry_rejects_empty_id() {
        let entry = openrouter_entry(serde_json::json!({ "id": "   " }));
        assert!(map_openrouter_entry(&entry).is_none());
    }

    #[test]
    fn map_openrouter_entry_drops_image_output_models() {
        let entry = openrouter_entry(serde_json::json!({
            "id": "vendor/image-gen",
            "architecture": { "output_modalities": ["image"] },
        }));
        assert!(
            map_openrouter_entry(&entry).is_none(),
            "image-generation models should not appear in the chat model picker"
        );
    }

    #[test]
    fn map_openrouter_entry_keeps_text_output_models() {
        let entry = openrouter_entry(serde_json::json!({
            "id": "vendor/chat-model",
            "architecture": { "output_modalities": ["text"] },
        }));
        assert!(map_openrouter_entry(&entry).is_some());
    }

    #[test]
    fn openrouter_models_response_parses_real_shaped_payload() {
        let body = serde_json::json!({
            "data": [
                {
                    "id": "fixture-provider/fixture-chat-model:free",
                    "name": "Fixture Catalog Model (Free)",
                    "context_length": 131072,
                    "pricing": { "prompt": "0", "completion": "0" },
                    "architecture": { "output_modalities": ["text"] }
                },
                {
                    "id": "vendor/lyria-music",
                    "name": "Lyria Music",
                    "architecture": { "output_modalities": ["audio"] }
                }
            ]
        });
        let parsed: OpenRouterModelsResponse =
            serde_json::from_value(body).expect("should deserialize real-shaped payload");
        let models: Vec<ModelInfo> = parsed
            .data
            .iter()
            .filter_map(map_openrouter_entry)
            .collect();
        assert_eq!(models.len(), 1, "audio-output model should be filtered out");
        assert_eq!(models[0].id, "fixture-provider/fixture-chat-model:free");
    }

    fn fork_request(messages: Vec<(&str, &str)>) -> ByokForkRequest {
        ByokForkRequest {
            user_id: "fork-user".to_string(),
            title: "Trip plan (BYOK fork)".to_string(),
            project_id: None,
            messages: messages
                .into_iter()
                .map(|(role, content)| ByokForkMessage {
                    role: role.to_string(),
                    content: content.to_string(),
                })
                .collect(),
        }
    }

    #[test]
    fn byok_fork_is_stored_as_its_own_byok_conversation() {
        use crate::data::db::{repository, Database};

        let db = Database::in_memory().expect("in-memory db");
        let conn_handle = db.get_connection();
        let conn = conn_handle.lock().expect("db lock");
        let request = fork_request(vec![
            ("user", "Plan a trip"),
            ("assistant", "Here is a plan"),
        ]);

        let id = create_byok_fork(&conn, &request).expect("fork should be stored");

        let conversation = repository::get_conversation(&conn, id, "fork-user").expect("stored");
        assert_eq!(conversation.execution_mode, "byok");
        let messages = repository::list_messages(&conn, id).expect("messages");
        assert_eq!(
            messages
                .iter()
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>(),
            vec!["Plan a trip", "Here is a plan"]
        );
    }

    #[test]
    fn byok_fork_refuses_empty_context_and_system_messages() {
        use crate::data::db::{repository, Database};

        let db = Database::in_memory().expect("in-memory db");
        let conn_handle = db.get_connection();
        let conn = conn_handle.lock().expect("db lock");

        assert!(create_byok_fork(&conn, &fork_request(vec![])).is_err());
        assert!(create_byok_fork(&conn, &fork_request(vec![("system", "secret prompt")])).is_err());
        let conversations =
            repository::list_conversations(&conn, 10, 0, "fork-user").expect("list conversations");
        assert!(
            conversations.is_empty(),
            "a refused fork must not leave a conversation behind"
        );
    }

    #[test]
    fn byok_provider_set_excludes_local_runtimes_and_managed_cloud() {
        for provider in [
            Provider::Ollama,
            Provider::LmStudio,
            Provider::LlamaCpp,
            Provider::Vllm,
            Provider::ManagedCloud,
        ] {
            assert!(!is_byok_provider(provider), "{}", provider.as_string());
        }
        assert!(is_byok_provider(Provider::OpenAI));
        assert!(is_byok_provider(Provider::OpenRouter));
    }

    #[test]
    fn a_local_runtime_key_can_be_listed_and_removed() {
        for provider in [Provider::LmStudio, Provider::LlamaCpp, Provider::Vllm] {
            assert!(can_hold_saved_key(provider), "{}", provider.as_string());
        }
        assert!(can_hold_saved_key(Provider::OpenAI));
        assert!(!can_hold_saved_key(Provider::Ollama));
        assert!(!can_hold_saved_key(Provider::ManagedCloud));
    }
}

#[cfg(test)]
mod saved_key_destination_tests {
    use super::*;

    fn settings() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn a_destination_is_the_host_and_any_port_that_is_not_the_schemes_own() {
        assert_eq!(
            destination_of("https://api.example.com/v1").as_deref(),
            Some("api.example.com")
        );
        assert_eq!(
            destination_of(" https://API.Example.com:8443/v1 ").as_deref(),
            Some("api.example.com:8443")
        );
        assert_eq!(
            destination_of("http://192.168.1.20:8000/v1").as_deref(),
            Some("192.168.1.20:8000")
        );
        assert_eq!(destination_of("not a url"), None);
    }

    #[test]
    fn every_loopback_spelling_is_one_place() {
        for spelling in [
            "http://localhost:1234/v1",
            "http://LOCALHOST:1234/v1",
            "http://127.0.0.1:1234/v1",
            "http://[::1]:1234/v1",
        ] {
            assert_eq!(
                destination_of(spelling).as_deref(),
                Some("localhost:1234"),
                "{spelling}"
            );
        }
    }

    #[test]
    fn a_providers_own_endpoint_is_its_registered_destination() {
        for provider in [Provider::OpenAI, Provider::Anthropic, Provider::LmStudio] {
            let registered = registered_destination(provider).expect("a registered endpoint");
            assert_eq!(
                default_base_url(provider)
                    .and_then(destination_of)
                    .as_deref(),
                Some(registered.as_str())
            );
        }
        assert_eq!(
            registered_destination(Provider::LmStudio),
            destination_of("http://127.0.0.1:1234/v1")
        );
        assert_ne!(
            registered_destination(Provider::LmStudio),
            destination_of("http://127.0.0.1:8080/v1"),
            "another port on this computer is another server"
        );
        assert_eq!(registered_destination(Provider::Azure), None);
    }

    #[test]
    fn the_question_names_the_provider_the_address_and_the_usual_endpoint() {
        let question =
            saved_key_destination_question(Provider::OpenAI, "collector.example.net").unwrap();
        let usual = registered_destination(Provider::OpenAI).unwrap();

        assert!(question.title.contains("openai"), "{}", question.title);
        assert!(question.body.contains("collector.example.net"));
        assert!(question.body.contains(&format!("instead of {usual}")));
        assert!(question.body.contains("with every request"));
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));

        let azure =
            saved_key_destination_question(Provider::Azure, "mine.openai.azure.com").unwrap();
        assert!(!azure.body.contains("instead of"));
        let local = saved_key_destination_question(Provider::Vllm, "192.168.1.20:8000").unwrap();
        assert!(local.title.contains("vLLM"), "{}", local.title);
    }

    #[test]
    fn a_confirmed_destination_is_remembered_for_that_provider_and_address_only() {
        let conn = settings();
        assert!(remembered_saved_key_destinations(&conn).is_empty());

        remember_saved_key_destination(&conn, Provider::Vllm, "192.168.1.20:8000").unwrap();
        remember_saved_key_destination(&conn, Provider::Vllm, "192.168.1.20:8000").unwrap();

        let remembered = remembered_saved_key_destinations(&conn);
        assert_eq!(
            remembered,
            vec![saved_key_destination_entry(
                Provider::Vllm,
                "192.168.1.20:8000"
            )]
        );
        assert!(!remembered.contains(&saved_key_destination_entry(
            Provider::LmStudio,
            "192.168.1.20:8000"
        )));
        assert!(!remembered.contains(&saved_key_destination_entry(
            Provider::Vllm,
            "192.168.1.21:8000"
        )));
    }

    #[test]
    fn a_saved_key_needs_no_question_for_the_registered_endpoint_or_an_agreed_address() {
        let agreed = vec![saved_key_destination_entry(
            Provider::Vllm,
            "192.168.1.20:8000",
        )];
        let nothing_agreed: Vec<String> = Vec::new();

        for (base_url, remembered) in [
            (None, &nothing_agreed),
            (Some("   "), &nothing_agreed),
            (Some("http://localhost:8000/v1"), &nothing_agreed),
            (Some("http://127.0.0.1:8000/v1"), &nothing_agreed),
            (Some("http://192.168.1.20:8000/v1"), &agreed),
        ] {
            assert_eq!(
                saved_key_destination(Provider::Vllm, base_url, remembered),
                Ok(SavedKeyDestination::Allowed),
                "{base_url:?}"
            );
        }
    }

    #[test]
    fn a_saved_key_and_any_other_address_needs_the_user_whatever_else_is_agreed() {
        let agreed = vec![
            saved_key_destination_entry(Provider::Vllm, "192.168.1.20:8000"),
            saved_key_destination_entry(Provider::LmStudio, "192.168.1.21:8000"),
        ];

        assert_eq!(
            saved_key_destination(Provider::Vllm, Some("http://192.168.1.21:8000/v1"), &agreed),
            Ok(SavedKeyDestination::NeedsConfirmation(
                "192.168.1.21:8000".to_string()
            )),
            "an address agreed for another runtime is not agreed for this one"
        );
        assert_eq!(
            saved_key_destination(
                Provider::OpenAI,
                Some("https://collector.example.net/v1"),
                &agreed
            ),
            Ok(SavedKeyDestination::NeedsConfirmation(
                "collector.example.net".to_string()
            ))
        );
        assert!(saved_key_destination(Provider::OpenAI, Some("not a url"), &agreed).is_err());
    }

    #[test]
    fn a_provider_left_unconnected_says_which_address_awaits_the_user() {
        assert_eq!(saved_key_awaits_confirmation(Provider::Cohere), None);

        awaiting_confirmation().insert(
            Provider::Cohere.as_string().to_string(),
            "collector.example.net".to_string(),
        );
        assert_eq!(
            saved_key_awaits_confirmation(Provider::Cohere).as_deref(),
            Some("collector.example.net")
        );
        assert_eq!(
            reconnect_to_confirm_message("collector.example.net"),
            "Reconnect to confirm sending your saved key to collector.example.net."
        );

        awaiting_confirmation().remove(Provider::Cohere.as_string());
        assert_eq!(saved_key_awaits_confirmation(Provider::Cohere), None);
    }

    #[test]
    fn removing_a_providers_key_forgets_what_was_agreed_for_it_and_nothing_else() {
        let conn = settings();
        remember_saved_key_destination(&conn, Provider::Vllm, "192.168.1.20:8000").unwrap();
        remember_saved_key_destination(&conn, Provider::Vllm, "192.168.1.21:8000").unwrap();
        remember_saved_key_destination(&conn, Provider::LmStudio, "192.168.1.20:1234").unwrap();

        forget_saved_key_destinations(&conn, Provider::Vllm).unwrap();
        forget_saved_key_destinations(&conn, Provider::Vllm).unwrap();

        assert_eq!(
            remembered_saved_key_destinations(&conn),
            vec![saved_key_destination_entry(
                Provider::LmStudio,
                "192.168.1.20:1234"
            )]
        );
    }

    #[test]
    fn a_remembered_row_that_does_not_parse_remembers_nothing() {
        let conn = settings();
        crate::core::mcp::config::upsert_settings_v2_value(
            &conn,
            SAVED_KEY_DESTINATIONS_SETTING,
            "not json",
            "security",
            false,
        )
        .unwrap();

        assert!(remembered_saved_key_destinations(&conn).is_empty());
    }
}
