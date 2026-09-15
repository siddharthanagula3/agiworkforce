use anyhow::Result;
use std::collections::HashMap;

use crate::config::CliConfig;
use crate::errors::CliError;

use super::{
    deepseek_provider, lmstudio_provider, minimax_provider, moonshot_provider, nvidia_provider,
    openai_provider, openrouter_provider, perplexity_provider, qwen_provider, xai_provider,
    zhipu_provider, OllamaMode, Provider,
};

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/// Resolve a `Provider` from a config provider name string.
///
/// Returns `None` if the name is not recognized, in which case callers
/// should fall back to [`detect_provider`] for model-name-based detection.
///
/// Recognizes the 10 pre-registered cloud providers, the two Ollama modes,
/// LM Studio, plus any custom provider registered through the dynamic
/// registry (see `register_custom_providers`).
pub fn provider_from_name(name: &str) -> Option<Provider> {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "agi" | "agiworkforce" | "managed-cloud" | "managed_cloud" | "managedcloud" => {
            Some(Provider::ManagedCloud)
        }
        "anthropic" => Some(Provider::Anthropic),
        "openai" => Some(openai_provider()),
        "google" => Some(Provider::Google),
        "ollama" | "ollama-local" | "ollama_local" => Some(Provider::Ollama(OllamaMode::Local)),
        "ollama-cloud" | "ollama_cloud" | "ollamacloud" => {
            Some(Provider::Ollama(OllamaMode::Cloud))
        }
        "xai" | "grok" => Some(xai_provider()),
        "deepseek" => Some(deepseek_provider()),
        "perplexity" => Some(perplexity_provider()),
        "qwen" | "dashscope" => Some(qwen_provider()),
        "moonshot" | "kimi" => Some(moonshot_provider()),
        "minimax" | "minimax-ai" | "minimaxai" => Some(minimax_provider()),
        "zhipu" | "glm" => Some(zhipu_provider()),
        "lmstudio" | "lm-studio" | "lm_studio" => Some(lmstudio_provider()),
        "openrouter" | "open-router" | "open_router" => Some(openrouter_provider()),
        "nvidia" | "nvidia-nim" | "nvidia_nim" | "nim" => Some(nvidia_provider()),
        _ => lookup_custom_provider(&lower),
    }
}

fn catalog_provider_for(model: &str) -> Option<Provider> {
    crate::model_catalog::find(model)
        .or_else(|| {
            model
                .strip_prefix("models/")
                .and_then(crate::model_catalog::find)
        })
        .and_then(|model| provider_from_name(&model.provider))
}

fn looks_like_local_ollama_model(model: &str) -> bool {
    let m = model.to_lowercase();
    m.starts_with("ollama:") || (m.contains(':') && !m.contains('/'))
}

/// Detect the provider from a model name string.
///
/// Hosted model IDs must resolve through the catalog. Prefix-only guesses for
/// `claude-*`, `gpt-*`, `gemini-*`, or router-looking model paths are intentionally rejected by
/// [`try_detect_provider`] so typoed or invented cloud models do not become
/// fake provider routes. Local Ollama-style model names are still accepted here;
/// the streaming path verifies the model exists on the local server before use.
pub fn try_detect_provider(model: &str) -> Option<Provider> {
    if let Some(provider) = catalog_provider_for(model) {
        return Some(provider);
    }

    let m = model.to_lowercase();
    if looks_like_local_ollama_model(&m) {
        Some(Provider::Ollama(OllamaMode::Local))
    } else {
        None
    }
}

pub fn detect_provider(model: &str) -> Provider {
    try_detect_provider(model).unwrap_or_else(openai_provider)
}

fn provider_allows_uncataloged_models(provider: &Provider) -> bool {
    match provider {
        Provider::Ollama(_) | Provider::Custom { .. } => true,
        Provider::OpenAICompatible { name, .. } => matches!(*name, "lmstudio" | "openrouter"),
        Provider::ManagedCloud | Provider::Anthropic | Provider::Google => false,
    }
}

/// Resolve the provider for a user-selected model.
///
/// If a provider override is explicit, validate that provider name first. Known
/// catalog models must still belong to that provider. Unknown model IDs are only
/// allowed for local/custom/dynamic providers where the provider endpoint, not
/// the shared model catalog, is the source of truth.
pub fn resolve_selected_provider(model: &str, provider_override: Option<&str>) -> Result<Provider> {
    if let Some(provider_override_name) = provider_override
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        let provider = provider_from_name(provider_override_name).ok_or_else(|| {
            CliError::config(format!(
                "Unknown provider '{}'. Run `agi login --help` to see supported providers.",
                provider_override_name
            ))
        })?;

        if let Some(catalog_model) = crate::model_catalog::find(model) {
            if provider == Provider::ManagedCloud {
                if !catalog_model.cloud_eligible && !crate::tier_cache::plan_lists_model(model) {
                    return Err(CliError::config(format!(
                        "Model '{}' is not eligible for AGI Workforce managed cloud.",
                        model
                    ))
                    .into());
                }
                return Ok(provider);
            }
            let catalog_provider =
                provider_from_name(&catalog_model.provider).ok_or_else(|| {
                    CliError::config(format!(
                        "Catalog model '{}' uses unsupported provider '{}'.",
                        model, catalog_model.provider
                    ))
                })?;
            if provider_name(&catalog_provider) != provider_name(&provider) {
                return Err(CliError::config(format!(
                    "Model '{}' belongs to provider '{}', not '{}'.",
                    model,
                    provider_name(&catalog_provider),
                    provider_name(&provider)
                ))
                .into());
            }
            return Ok(provider);
        }

        if provider_allows_uncataloged_models(&provider) {
            return Ok(provider);
        }

        return Err(CliError::config(format!(
            "Unknown model '{}' for provider '{}'. Add it to [[models]] in config.toml or choose a model from `agi models list`.",
            model,
            provider_name(&provider)
        ))
        .into());
    }

    try_detect_provider(model).ok_or_else(|| {
        CliError::config(format!(
            "Unknown model '{}'. Run `agi models scan` for local models or `agi models list` for catalog models, then choose a listed model.",
            model
        ))
        .into()
    })
}

/// Resolve the model an `exec`-style subcommand should use.
///
/// Precedence: subcommand-level `--model` > top-level `--model` > config
/// default. Mirrors `selection_provider_override`'s explicit-provider
/// fallback, without the top-level layer, `agi --model X exec "…"` silently
/// dropped `X` and ran the config-default model.
pub fn resolve_exec_model(
    subcommand_model: Option<&str>,
    top_level_model: Option<&str>,
    configured_model: &str,
) -> String {
    for candidate in [subcommand_model, top_level_model] {
        if let Some(value) = candidate.map(str::trim).filter(|v| !v.is_empty()) {
            return value.to_string();
        }
    }
    configured_model.to_string()
}

pub fn selection_provider_override<'a>(
    selected_model: &str,
    configured_model: &str,
    configured_provider: &'a str,
    explicit_provider: Option<&'a str>,
) -> Option<&'a str> {
    if let Some(provider) = explicit_provider
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(provider);
    }
    let configured_provider = configured_provider.trim();
    if configured_provider.is_empty() {
        return None;
    }
    if selected_model == configured_model {
        Some(configured_provider)
    } else {
        None
    }
}

/// The provider a surface hands its session: an explicit choice wins, then the
/// plan for a model the account runs, then the configured vendor for the
/// configured model. Without the middle step every interactive surface handed
/// the configured vendor to the route decision and asked for its key while the
/// user was signed in.
pub fn plan_first_provider_override(
    account: &AccountRoute,
    selected_model: &str,
    configured_model: &str,
    configured_provider: &str,
    explicit_provider: Option<&str>,
) -> Option<String> {
    if let Some(provider) = explicit_provider
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(provider.to_string());
    }
    if account.runs_managed(selected_model) {
        return Some(provider_name(&Provider::ManagedCloud).to_string());
    }
    selection_provider_override(selected_model, configured_model, configured_provider, None)
        .map(str::to_string)
}

// ---------------------------------------------------------------------------
// Route selection
// ---------------------------------------------------------------------------

/// The account facts a route decision needs, read once so a caller deciding for
/// many models does not re-read the auth store per model.
#[derive(Debug, Clone, Default)]
pub struct AccountRoute {
    signed_in: bool,
    tier: Option<crate::tier_cache::UserTier>,
    plan_models: Option<std::collections::HashSet<String>>,
}

impl AccountRoute {
    /// A route whose account facts are given rather than read from this
    /// machine, so a caller can decide for a state it is not in.
    pub fn with(signed_in: bool, tier: Option<crate::tier_cache::UserTier>) -> Self {
        Self {
            signed_in,
            tier,
            plan_models: None,
        }
    }

    /// The same, with the hosted list's answer for what the plan runs.
    pub fn with_plan_models(mut self, models: &[&str]) -> Self {
        self.plan_models = Some(models.iter().map(|id| id.to_lowercase()).collect());
        self
    }

    pub fn load() -> Self {
        Self {
            signed_in: crate::tier_cache::load_jwt().is_some(),
            tier: crate::tier_cache::read_tier_cache().map(|cached| cached.tier),
            plan_models: crate::tier_cache::read_plan_models_cache()
                .map(|models| models.into_iter().collect()),
        }
    }

    pub fn signed_in(&self) -> bool {
        self.signed_in
    }

    fn tier_label(&self) -> String {
        self.tier
            .as_ref()
            .map(|tier| tier.label().to_string())
            .unwrap_or_else(|| "current".to_string())
    }

    /// True when the managed route can run this model. An unknown tier is not
    /// a refusal; the server decides.
    fn runs_managed(&self, model: &str) -> bool {
        if !self.signed_in {
            return false;
        }
        if let Some(plan_models) = &self.plan_models {
            return plan_models.contains(&model.to_lowercase())
                || plan_models
                    .contains(&crate::model_catalog::canonical_model_id(model).to_lowercase());
        }
        let Some(entry) = crate::model_catalog::find(model) else {
            return false;
        };
        if !entry.cloud_eligible {
            return false;
        }
        match self.tier.as_ref() {
            Some(tier) => crate::model_catalog::can_access_model_for_tier(model, tier),
            None => true,
        }
    }

    fn cloud_eligible(model: &str) -> bool {
        crate::model_catalog::find(model).is_some_and(|entry| entry.cloud_eligible)
            || crate::tier_cache::plan_lists_model(model)
    }
}

/// What [`decide_turn_route`] chose, and why it cannot run when it cannot.
pub enum TurnRoute {
    Runnable(Provider),
    Blocked {
        provider: Option<Provider>,
        error: anyhow::Error,
    },
}

impl TurnRoute {
    /// The route, whether or not it can run right now. A session is built on
    /// this so a missing credential is reported by the turn, not by the build.
    pub fn provider(self) -> Result<Provider> {
        match self {
            TurnRoute::Runnable(provider)
            | TurnRoute::Blocked {
                provider: Some(provider),
                ..
            } => Ok(provider),
            TurnRoute::Blocked { error, .. } => Err(error),
        }
    }

    pub fn runnable(self) -> Result<Provider> {
        match self {
            TurnRoute::Runnable(provider) => Ok(provider),
            TurnRoute::Blocked { error, .. } => Err(error),
        }
    }
}

/// The route a turn takes for `model`, and the one the model list reports.
///
/// An explicit provider still wins. Otherwise the managed account comes first
/// when it can run the model, then the vendor's own key, so a subscriber is
/// never asked for a key their plan already covers.
pub fn decide_turn_route(
    config: &CliConfig,
    account: &AccountRoute,
    model: &str,
    provider_override: Option<&str>,
) -> TurnRoute {
    if provider_override
        .map(str::trim)
        .is_some_and(|name| !name.is_empty())
    {
        return match resolve_selected_provider(model, provider_override) {
            Ok(provider) => match resolve_key(config, &provider) {
                Ok(_) => TurnRoute::Runnable(provider),
                Err(error) => TurnRoute::Blocked {
                    provider: Some(provider),
                    error,
                },
            },
            Err(error) => TurnRoute::Blocked {
                provider: None,
                error,
            },
        };
    }

    if account.runs_managed(model) {
        return TurnRoute::Runnable(Provider::ManagedCloud);
    }

    let vendor = resolve_selected_provider(model, None);
    if let Ok(provider) = &vendor {
        if resolve_key(config, provider).is_ok() {
            return TurnRoute::Runnable(provider.clone());
        }
    }

    if AccountRoute::cloud_eligible(model) {
        let error = if account.signed_in {
            CliError::PlanExcludesModel {
                model: model.to_string(),
                tier: account.tier_label(),
            }
        } else {
            CliError::AccountSignedOut {
                model: model.to_string(),
            }
        };
        return TurnRoute::Blocked {
            provider: Some(Provider::ManagedCloud),
            error: error.into(),
        };
    }

    match vendor {
        Ok(provider) => {
            let error = resolve_key(config, &provider).err().unwrap_or_else(|| {
                CliError::Config {
                    message: format!("No route on this machine can run '{model}'."),
                }
                .into()
            });
            TurnRoute::Blocked {
                provider: Some(provider),
                error,
            }
        }
        Err(error) => TurnRoute::Blocked {
            provider: None,
            error,
        },
    }
}

/// Whether a turn on this session's route could start at all, judged the way
/// the first provider call will judge it, so a surface can report a refusal
/// before it announces any work.
pub async fn turn_can_start(config: &CliConfig, provider: &Provider, model: &str) -> Result<()> {
    if try_subscription_auth(provider).await.is_some() {
        return Ok(());
    }
    crate::tier_cache::ensure_plan_models_cached().await;
    match resolve_key(config, provider) {
        Ok(_) => Ok(()),
        Err(error) => match resolve_turn_route(config, &AccountRoute::load(), model, None) {
            Ok(_) => Err(error),
            Err(account) => Err(account),
        },
    }
}

/// The route a turn can actually run on, or why none can.
pub fn resolve_turn_route(
    config: &CliConfig,
    account: &AccountRoute,
    model: &str,
    provider_override: Option<&str>,
) -> Result<Provider> {
    decide_turn_route(config, account, model, provider_override).runnable()
}

/// The route a session is built on, which may still need a credential.
pub fn select_turn_route(
    config: &CliConfig,
    account: &AccountRoute,
    model: &str,
    provider_override: Option<&str>,
) -> Result<Provider> {
    decide_turn_route(config, account, model, provider_override).provider()
}

/// Resolve the API key for a provider, returning an error if required but missing.
pub(crate) fn resolve_key(config: &CliConfig, provider: &Provider) -> Result<Option<String>> {
    let name = provider_name(provider);
    match provider {
        Provider::ManagedCloud => {
            let token = crate::tier_cache::load_jwt();
            if token.is_none() {
                return Err(CliError::auth_missing(name, "No AGI Workforce session found.").into());
            }
            Ok(token)
        }
        Provider::Ollama(OllamaMode::Local) => Ok(None), // no key needed
        Provider::Ollama(OllamaMode::Cloud) => {
            let key = resolve_config_env_auth_key(config, name, "OLLAMA_API_KEY");
            if key.is_none() {
                return Err(
                    CliError::auth_missing(name, auth_missing_message("OLLAMA_API_KEY")).into(),
                );
            }
            Ok(key)
        }
        Provider::OpenAICompatible {
            name: pname,
            api_key_env,
            ..
        } => {
            // Keyless local endpoints (LM Studio) can return None.
            let Some(env_var) = api_key_env else {
                return Ok(None);
            };
            let key = resolve_config_env_auth_key(config, pname, env_var);
            if key.is_none() {
                return Err(CliError::auth_missing(*pname, auth_missing_message(env_var)).into());
            }
            Ok(key)
        }
        Provider::Custom {
            name: pname,
            api_key_env,
            ..
        } => {
            let Some(env_var) = api_key_env else {
                return Ok(None);
            };
            let key = config
                .resolve_api_key(pname)
                .filter(|k| !k.trim().is_empty())
                .or_else(|| env_api_key(env_var))
                .or_else(|| auth_store_api_key(pname));
            if key.is_none() {
                return Err(
                    CliError::auth_missing(pname.clone(), auth_missing_message(env_var)).into(),
                );
            }
            Ok(key)
        }
        Provider::Anthropic | Provider::Google => {
            let env_var = config
                .providers
                .get(name)
                .and_then(|p| p.api_key_env.as_deref())
                .unwrap_or("UNKNOWN");
            let key = config
                .resolve_api_key(name)
                .filter(|k| !k.trim().is_empty())
                .or_else(|| env_api_key(env_var))
                .or_else(|| auth_store_api_key(name));
            if key.is_none() {
                return Err(CliError::auth_missing(name, auth_missing_message(env_var)).into());
            }
            Ok(key)
        }
    }
}

fn auth_missing_message(env_var: &str) -> String {
    format!("No API key found in the auth store or {env_var}.")
}

fn env_api_key(env_var: &str) -> Option<String> {
    std::env::var(env_var).ok().filter(|k| !k.trim().is_empty())
}

fn resolve_config_env_auth_key(
    config: &CliConfig,
    provider_name: &str,
    env_var: &str,
) -> Option<String> {
    config_api_key(config, provider_name)
        .or_else(|| env_api_key(env_var))
        .or_else(|| auth_store_api_key(provider_name))
}

fn config_api_key(config: &CliConfig, provider_name: &str) -> Option<String> {
    config
        .resolve_api_key(provider_name)
        .filter(|k| !k.trim().is_empty())
        .or_else(|| {
            auth_store_keys(provider_name)
                .into_iter()
                .find_map(|key| config.resolve_api_key(key).filter(|k| !k.trim().is_empty()))
        })
}

fn auth_store_api_key(provider_name: &str) -> Option<String> {
    let store = crate::auth::load_auth().ok()?;
    api_key_from_auth_store(&store, provider_name)
}

pub(crate) fn api_key_from_auth_store(
    store: &crate::auth::AuthStore,
    provider_name: &str,
) -> Option<String> {
    if let Some(crate::auth::AuthEntry::ApiKey { key }) = store.entries.get(provider_name) {
        if !key.trim().is_empty() {
            return Some(key.clone());
        }
    }

    for key in auth_store_keys(provider_name) {
        if let Some(crate::auth::AuthEntry::ApiKey { key }) = store.entries.get(key) {
            if !key.trim().is_empty() {
                return Some(key.clone());
            }
        }
    }
    None
}

pub(crate) fn auth_store_keys(provider_name: &str) -> Vec<&'static str> {
    match provider_name.to_ascii_lowercase().as_str() {
        "openrouter" | "open_router" | "open-router" => {
            vec!["openrouter", "open_router", "open-router"]
        }
        "nvidia" | "nvidia_nim" | "nvidia-nim" | "nim" => {
            vec!["nvidia", "nvidia_nim", "nvidia-nim", "nim"]
        }
        "ollama_cloud" | "ollama-cloud" | "ollamacloud" => {
            vec!["ollama-cloud", "ollama_cloud", "ollamacloud"]
        }
        "lm-studio" | "lm_studio" | "lmstudio" => vec!["lmstudio", "lm-studio", "lm_studio"],
        "anthropic" => vec!["anthropic"],
        "openai" => vec!["openai"],
        "google" => vec!["google"],
        "xai" | "grok" => vec!["xai", "grok"],
        "deepseek" => vec!["deepseek"],
        "perplexity" => vec!["perplexity"],
        "qwen" | "dashscope" => vec!["qwen", "dashscope"],
        "moonshot" | "kimi" => vec!["moonshot", "kimi"],
        "minimax" | "minimax-ai" | "minimaxai" => vec!["minimax", "minimax-ai", "minimaxai"],
        "zhipu" | "glm" => vec!["zhipu", "glm"],
        _ => Vec::new(),
    }
}

pub fn provider_name(provider: &Provider) -> &'static str {
    match provider {
        Provider::ManagedCloud => "managed_cloud",
        Provider::Anthropic => "anthropic",
        Provider::Google => "google",
        Provider::Ollama(OllamaMode::Local) => "ollama",
        Provider::Ollama(OllamaMode::Cloud) => "ollama_cloud",
        Provider::OpenAICompatible { name, .. } => name,
        // Custom providers have owned String names; we leak a static name only
        // for matching against config maps. Use the first registered custom
        // name here, callers needing the dynamic name should match on the
        // variant directly. Falls back to "custom" as a stable label.
        Provider::Custom { .. } => "custom",
    }
}

/// Canonical provider identity suitable for durable session metadata.
/// Unlike `provider_name`, this retains the configured name of a custom
/// provider so a restart cannot silently bind the session to another route.
pub fn provider_persistence_name(provider: &Provider) -> String {
    match provider {
        Provider::Custom { name, .. } => name.clone(),
        _ => provider_name(provider).to_string(),
    }
}

/// Custom provider lookup helper used by `provider_from_name` to resolve names
/// loaded from `[providers.*]` blocks in `~/.agiworkforce/config.toml`.
fn lookup_custom_provider(name: &str) -> Option<Provider> {
    let registry = CUSTOM_PROVIDERS.read().ok()?;
    registry.get(name).cloned()
}

/// Process-wide registry of user-defined OpenAI-compatible providers loaded from
/// `[providers.<name>]` config blocks. Populated once at startup by
/// `register_custom_providers`.
static CUSTOM_PROVIDERS: once_cell::sync::Lazy<std::sync::RwLock<HashMap<String, Provider>>> =
    once_cell::sync::Lazy::new(|| std::sync::RwLock::new(HashMap::new()));

/// Register custom OpenAI-compatible providers loaded from the user config file.
///
/// Skips entries whose name collides with a pre-registered provider (Anthropic,
/// OpenAI, Google, Ollama, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu,
/// LM Studio, MiniMax) so users cannot accidentally hijack a native handler.
///
/// Each entry needs a `base_url`; `api_key_env` is optional (omit for keyless
/// local endpoints). Base URLs without `/chat/completions` get the path
/// appended automatically so users can provide either form.
pub fn register_custom_providers(config: &CliConfig) {
    const RESERVED: &[&str] = &[
        "agi",
        "agiworkforce",
        "managed-cloud",
        "managed_cloud",
        "managedcloud",
        "anthropic",
        "openai",
        "google",
        "ollama",
        "ollama-cloud",
        "ollama_cloud",
        "ollamacloud",
        "xai",
        "grok",
        "deepseek",
        "perplexity",
        "qwen",
        "dashscope",
        "moonshot",
        "kimi",
        "zhipu",
        "glm",
        "lmstudio",
        "lm-studio",
        "lm_studio",
        "minimax",
        "minimax-ai",
        "minimaxai",
        "openrouter",
        "open-router",
        "open_router",
        "nvidia",
        "nvidia-nim",
        "nvidia_nim",
        "nim",
    ];

    let Ok(mut registry) = CUSTOM_PROVIDERS.write() else {
        return;
    };
    registry.clear();

    for (name, pc) in &config.providers {
        let lower = name.to_lowercase();
        if RESERVED.contains(&lower.as_str()) {
            continue;
        }
        let Some(base) = pc.base_url.as_ref() else {
            continue;
        };
        let trimmed = base.trim_end_matches('/');

        // SEV-CLI-04 fix: enforce a scheme allowlist before registering any
        // custom provider. Without this, a project-level config inside a cloned
        // repository can point base_url at IMDS (169.254.169.254), an internal
        // service, or another loopback port and exfiltrate API keys + prompts
        // there. Permit only https:// (production) and explicit loopback hosts
        // for local model servers (Ollama, LMStudio).
        if !is_safe_provider_base_url(trimmed) {
            tracing::warn!(
                provider = %lower,
                base_url = %trimmed,
                "skipping custom provider, base_url must be https:// or http://(localhost|127.0.0.1|[::1])"
            );
            continue;
        }

        let url = if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else {
            format!("{}/chat/completions", trimmed)
        };
        registry.insert(
            lower.clone(),
            Provider::Custom {
                name: lower,
                base_url: url,
                api_key_env: pc.api_key_env.clone(),
            },
        );
    }
}

/// Returns true if the URL is acceptable as a custom-provider base URL.
/// Allows `https://` to any host, and `http://` only to loopback hosts.
pub(crate) fn is_safe_provider_base_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return false;
    }
    is_local_provider_base_url(url) || (parsed.scheme() == "https" && parsed.host_str().is_some())
}

/// Classify only parsed HTTP(S) URLs whose authority is exactly localhost,
/// an IP loopback, or an explicitly supported unspecified bind address.
/// Credentials are rejected even for local hosts so authority confusion can
/// never influence the Local privacy boundary.
pub(crate) fn is_local_provider_base_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    // `Url::host_str()` preserves brackets around IPv6 literals in the
    // reqwest/url version used by this workspace. Strip only a matching pair
    // before parsing the address; ordinary hostnames remain unchanged.
    let host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    match host.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(address)) => address.is_loopback() || address.is_unspecified(),
        Ok(std::net::IpAddr::V6(address)) => {
            address.is_loopback()
                || address.is_unspecified()
                || address
                    .to_ipv4_mapped()
                    .is_some_and(|mapped| mapped.is_loopback() || mapped.is_unspecified())
        }
        Err(_) => false,
    }
}

// ---------------------------------------------------------------------------
// Subscription auth helpers
// ---------------------------------------------------------------------------

/// Try subscription auth (Copilot) for the given provider.
///
/// Returns `Some((token, url, subscription_name))` if subscription
/// auth is available, `None` otherwise. The URL is always the one
/// [`crate::auth::resolve_auth`] returned with the token, this function never
/// supplies an endpoint of its own, so a subscription credential cannot be sent
/// to a provider endpoint that did not issue it.
pub(crate) async fn try_subscription_auth(provider: &Provider) -> Option<(String, String, String)> {
    let mut auth_store = crate::auth::load_auth().ok()?;

    // Determine which subscription providers are compatible with this Provider
    let subscription_names: &[&str] = match provider {
        Provider::OpenAICompatible { name: "openai", .. } => &["copilot"],
        Provider::Anthropic => &["copilot"], // Copilot can proxy Claude models
        _ => return None,
    };

    for &sub_name in subscription_names {
        if let Ok(Some((token, base_url_override))) =
            crate::auth::resolve_auth(&mut auth_store, sub_name).await
        {
            // The endpoint is owned by the adapter that resolved the credential:
            // `auth::resolve_auth` hands back Copilot's chat-completions URL next
            // to the token it minted. There is
            // deliberately no default endpoint here, this used to fall back to a
            // second copy of the OpenAI chat-completions URL, which would have
            // posted any future subscription's token, and the prompt with it, to
            // OpenAI. A subscription that names no endpoint is skipped so the
            // caller falls through to API-key auth for the selected provider.
            let Some(url) = base_url_override else {
                continue;
            };
            // Subscription auth tokens must only be sent over HTTPS
            if !url.starts_with("https://") {
                // Redact URL to avoid leaking embedded credentials in logs
                let scheme = url.split("://").next().unwrap_or("unknown");
                eprintln!(
                    "[auth] Rejecting non-HTTPS subscription URL for {} (scheme: {})",
                    sub_name, scheme
                );
                continue;
            }
            // Persist any token refreshes that happened during resolve_auth
            let _ = crate::auth::save_auth(&auth_store);
            return Some((token, url, sub_name.to_string()));
        }
    }

    // Persist any token refreshes even if none matched
    let _ = crate::auth::save_auth(&auth_store);
    None
}

#[cfg(test)]
mod safe_provider_url_tests {
    use super::{is_local_provider_base_url, is_safe_provider_base_url};

    #[test]
    fn https_anywhere_is_allowed() {
        assert!(is_safe_provider_base_url("https://api.openai.com/v1"));
        assert!(is_safe_provider_base_url("https://example.com"));
    }

    #[test]
    fn http_localhost_is_allowed() {
        assert!(is_safe_provider_base_url("http://localhost:11434/v1"));
        assert!(is_safe_provider_base_url("http://127.0.0.1:1234"));
        assert!(is_safe_provider_base_url("http://[::1]:8000/v1"));
        assert!(is_safe_provider_base_url("http://0.0.0.0:8080"));
    }

    #[test]
    fn http_external_is_blocked() {
        assert!(!is_safe_provider_base_url("http://example.com"));
        assert!(!is_safe_provider_base_url(
            "http://169.254.169.254/latest/meta-data"
        ));
        assert!(!is_safe_provider_base_url("http://192.168.1.1"));
        assert!(!is_safe_provider_base_url("http://localhost.evil.com"));
    }

    #[test]
    fn other_schemes_are_blocked() {
        assert!(!is_safe_provider_base_url("file:///etc/passwd"));
        assert!(!is_safe_provider_base_url("ftp://example.com"));
        assert!(!is_safe_provider_base_url("gopher://internal"));
        assert!(!is_safe_provider_base_url(""));
        assert!(!is_safe_provider_base_url("localhost:8080"));
    }

    #[test]
    fn local_classifier_uses_parsed_exact_hosts() {
        for local in [
            "http://localhost:11434/v1",
            "HTTPS://LOCALHOST:8443/v1",
            "http://127.0.0.1:1234",
            "http://127.42.0.9/v1",
            "http://[::1]:8000/v1",
            "http://0.0.0.0:8080/v1",
            "http://[::]:8080/v1",
            "http://[::ffff:127.0.0.1]:8080/v1",
        ] {
            assert!(
                is_local_provider_base_url(local),
                "local URL rejected: {local}"
            );
        }
    }

    #[test]
    fn local_classifier_rejects_deceptive_credentials_and_remote_hosts() {
        for remote in [
            "http://localhost.evil.com/v1",
            "http://127.evil.com/v1",
            "http://0.0.0.0.evil/v1",
            "http://localhost@evil.com/v1",
            "http://user@localhost/v1",
            "http://user:pass@127.0.0.1/v1",
            "http://192.168.1.20/v1",
            "https://example.com/v1",
            "file://localhost/tmp/model",
            "http://[::1",
            "not a url",
        ] {
            assert!(
                !is_local_provider_base_url(remote),
                "remote URL classified Local: {remote}"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OllamaMode, Provider};

    fn plan_model() -> String {
        crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| {
                model.cloud_eligible
                    && crate::model_catalog::can_access_model_for_tier(
                        &model.id,
                        &crate::tier_cache::UserTier::Max,
                    )
            })
            .map(|model| model.id.clone())
            .expect("the bundled catalog carries a plan model")
    }

    #[test]
    fn a_signed_in_account_runs_its_plan_model_before_the_configured_vendor() {
        let model = plan_model();
        let account = AccountRoute::with(true, Some(crate::tier_cache::UserTier::Max));
        assert_eq!(
            plan_first_provider_override(&account, &model, &model, "anthropic", None).as_deref(),
            Some("managed_cloud")
        );
    }

    #[test]
    fn a_signed_out_account_keeps_the_configured_vendor_for_the_configured_model() {
        let model = plan_model();
        let account = AccountRoute::with(false, None);
        assert_eq!(
            plan_first_provider_override(&account, &model, &model, "anthropic", None).as_deref(),
            Some("anthropic")
        );
        assert_eq!(
            plan_first_provider_override(&account, &model, "other-model", "anthropic", None),
            None
        );
    }

    #[test]
    fn the_hosted_list_decides_what_the_plan_runs_once_it_is_known() {
        let listed = "some-model-the-bundled-table-never-named";
        let account = AccountRoute::with(true, Some(crate::tier_cache::UserTier::Max))
            .with_plan_models(&[listed, "Another-Listed-Model"]);
        assert!(account.runs_managed(listed));
        assert!(account.runs_managed("another-listed-model"));
        assert!(!account.runs_managed(&plan_model()));
        let dated = crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| crate::model_catalog::canonical_model_id(&model.id) != model.id)
            .map(|model| model.id.clone())
            .expect("some bundled model carries a vendor wire id");
        let canonical = crate::model_catalog::canonical_model_id(&dated);
        let by_canonical = AccountRoute::with(true, None).with_plan_models(&[canonical.as_str()]);
        assert!(
            by_canonical.runs_managed(&dated),
            "the wire id runs when the list names the id"
        );
        assert_eq!(
            plan_first_provider_override(&account, listed, "config-model", "anthropic", None)
                .as_deref(),
            Some("managed_cloud")
        );
    }

    #[tokio::test]
    async fn a_managed_turn_with_no_session_cannot_start_and_says_so() {
        let model = plan_model();
        let error = turn_can_start(&CliConfig::default(), &Provider::ManagedCloud, &model)
            .await
            .expect_err("no session on this machine in tests");
        let failure = error
            .chain()
            .find_map(|cause| cause.downcast_ref::<crate::errors::CliError>())
            .map(crate::errors::CliError::turn_failure)
            .expect("a CLI error names the failure");
        assert_eq!(
            failure.code,
            agiworkforce_protocol::developer_session::TurnFailureCode::AccountSignedOut
        );
    }

    #[test]
    fn an_explicit_provider_wins_over_the_plan() {
        let model = plan_model();
        let account = AccountRoute::with(true, Some(crate::tier_cache::UserTier::Max));
        assert_eq!(
            plan_first_provider_override(&account, &model, &model, "anthropic", Some("ollama"))
                .as_deref(),
            Some("ollama")
        );
    }

    // ── resolve_exec_model precedence: exec flag > top-level flag > config ──

    #[test]
    fn exec_model_prefers_subcommand_flag_over_all() {
        assert_eq!(
            resolve_exec_model(Some("exec-model"), Some("top-model"), "config-model"),
            "exec-model"
        );
    }

    #[test]
    fn exec_model_falls_back_to_top_level_flag() {
        assert_eq!(
            resolve_exec_model(None, Some("top-model"), "config-model"),
            "top-model"
        );
    }

    #[test]
    fn exec_model_falls_back_to_config_default() {
        assert_eq!(
            resolve_exec_model(None, None, "config-model"),
            "config-model"
        );
    }

    #[test]
    fn exec_model_skips_blank_flag_layers() {
        assert_eq!(
            resolve_exec_model(Some("  "), Some(""), "config-model"),
            "config-model"
        );
        assert_eq!(
            resolve_exec_model(Some(""), Some("top-model"), "config-model"),
            "top-model"
        );
    }

    fn sample_model_for(provider: &str) -> String {
        crate::model_catalog::models_for(provider)
            .first()
            .unwrap_or_else(|| panic!("expected at least one {provider} model"))
            .id
            .clone()
    }

    #[test]
    fn test_provider_detection() {
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("anthropic"))),
            "anthropic"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("openai"))),
            "openai"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("google"))),
            "google"
        );
        assert_eq!(
            detect_provider("fixture-local-model:latest"),
            Provider::Ollama(OllamaMode::Local)
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("minimax"))),
            "minimax"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("xai"))),
            "xai"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("deepseek"))),
            "deepseek"
        );
        assert_eq!(
            detect_provider("ollama:fixture-model"),
            Provider::Ollama(OllamaMode::Local)
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("zhipu"))),
            "zhipu"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("moonshot"))),
            "moonshot"
        );
        assert!(try_detect_provider("fixture-unknown-cloud-model-a").is_none());
        assert!(try_detect_provider("fixture-unknown-cloud-model-b").is_none());
        assert!(try_detect_provider("fixture-local-model").is_none());
        assert!(try_detect_provider("fixture-unknown-model").is_none());
        assert_eq!(
            provider_name(&detect_provider("fixture-unknown-model")),
            "openai"
        );
    }

    #[test]
    fn test_provider_from_name_canonical_names() {
        assert!(matches!(
            provider_from_name("agiworkforce"),
            Some(Provider::ManagedCloud)
        ));
        assert!(matches!(
            provider_from_name("managed_cloud"),
            Some(Provider::ManagedCloud)
        ));
        assert!(matches!(
            provider_from_name("anthropic"),
            Some(Provider::Anthropic)
        ));
        assert_eq!(
            provider_name(&provider_from_name("openai").unwrap()),
            "openai"
        );
        assert_eq!(provider_name(&provider_from_name("xai").unwrap()), "xai");
        assert_eq!(
            provider_name(&provider_from_name("deepseek").unwrap()),
            "deepseek"
        );
        assert_eq!(
            provider_name(&provider_from_name("perplexity").unwrap()),
            "perplexity"
        );
        assert_eq!(provider_name(&provider_from_name("qwen").unwrap()), "qwen");
        assert_eq!(
            provider_name(&provider_from_name("moonshot").unwrap()),
            "moonshot"
        );
        assert_eq!(
            provider_name(&provider_from_name("zhipu").unwrap()),
            "zhipu"
        );
        assert_eq!(
            provider_name(&provider_from_name("lmstudio").unwrap()),
            "lmstudio"
        );
        assert_eq!(
            provider_name(&provider_from_name("openrouter").unwrap()),
            "openrouter"
        );
        assert_eq!(
            provider_name(&provider_from_name("open_router").unwrap()),
            "openrouter"
        );
        assert_eq!(
            provider_name(&provider_from_name("nvidia").unwrap()),
            "nvidia"
        );
        assert_eq!(
            provider_name(&provider_from_name("nvidia_nim").unwrap()),
            "nvidia"
        );
        // Aliases
        assert_eq!(provider_name(&provider_from_name("grok").unwrap()), "xai");
        assert_eq!(
            provider_name(&provider_from_name("kimi").unwrap()),
            "moonshot"
        );
        assert_eq!(provider_name(&provider_from_name("glm").unwrap()), "zhipu");
        assert_eq!(
            provider_name(&provider_from_name("dashscope").unwrap()),
            "qwen"
        );
        // Ollama modes
        assert!(matches!(
            provider_from_name("ollama"),
            Some(Provider::Ollama(OllamaMode::Local))
        ));
        assert!(matches!(
            provider_from_name("ollama-cloud"),
            Some(Provider::Ollama(OllamaMode::Cloud))
        ));
        // Unknown returns None (and no custom registered)
        assert!(provider_from_name("definitely-not-a-provider").is_none());
    }

    #[test]
    fn managed_cloud_override_accepts_a_cloud_eligible_catalog_model() {
        let model = sample_model_for("anthropic");
        let provider = resolve_selected_provider(&model, Some("agiworkforce"))
            .expect("managed cloud must accept concrete upstream catalog models");

        assert_eq!(provider, Provider::ManagedCloud);
        assert_eq!(provider_name(&provider), "managed_cloud");
    }

    #[test]
    fn managed_cloud_override_rejects_an_uncataloged_model() {
        let error = resolve_selected_provider("invented-frontier-model", Some("managed_cloud"))
            .expect_err("managed cloud must not forward invented model ids");

        assert!(error.to_string().contains("Unknown model"), "{error}");
    }

    #[test]
    fn test_lmstudio_no_api_key_required() {
        let provider = crate::models::lmstudio_provider();
        let Provider::OpenAICompatible {
            name, api_key_env, ..
        } = &provider
        else {
            panic!("Expected OpenAICompatible");
        };
        assert_eq!(*name, "lmstudio");
        assert!(api_key_env.is_none(), "LM Studio is keyless local");
    }

    #[test]
    fn api_key_auth_store_aliases_resolve() {
        let mut entries = HashMap::new();
        entries.insert(
            "open_router".to_string(),
            crate::auth::AuthEntry::ApiKey {
                key: "or-key".to_string(),
            },
        );
        entries.insert(
            "nvidia_nim".to_string(),
            crate::auth::AuthEntry::ApiKey {
                key: "nv-key".to_string(),
            },
        );
        let store = crate::auth::AuthStore {
            entries,
            copilot_cache: None,
        };

        assert_eq!(
            api_key_from_auth_store(&store, "openrouter").as_deref(),
            Some("or-key")
        );
        assert_eq!(
            api_key_from_auth_store(&store, "nvidia").as_deref(),
            Some("nv-key")
        );
    }

    #[test]
    fn minimax_provider_resolved_from_name() {
        assert_eq!(
            provider_name(&provider_from_name("minimax").unwrap()),
            "minimax"
        );
        assert_eq!(
            provider_name(&provider_from_name("minimax-ai").unwrap()),
            "minimax"
        );
        assert_eq!(
            provider_name(&provider_from_name("minimaxai").unwrap()),
            "minimax"
        );
        // Verify MINIMAX_API_KEY is wired
        let p = provider_from_name("minimax").unwrap();
        let Provider::OpenAICompatible { api_key_env, .. } = &p else {
            panic!("Expected OpenAICompatible");
        };
        assert_eq!(*api_key_env, Some("MINIMAX_API_KEY"));
    }

    #[test]
    fn test_register_custom_providers_skips_reserved() {
        let mut config = CliConfig::default();
        // Try to register a "fake-anthropic" override and a real custom one
        config.providers.insert(
            "anthropic".to_string(),
            crate::config::ProviderConfig {
                api_key_env: Some("FAKE".to_string()),
                base_url: Some("https://attacker.test/v1".to_string()),
            },
        );
        config.providers.insert(
            "openrouter-test-uniq".to_string(),
            crate::config::ProviderConfig {
                api_key_env: Some("OPENROUTER_API_KEY".to_string()),
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
            },
        );
        register_custom_providers(&config);
        // anthropic must still resolve to the native handler
        assert!(matches!(
            provider_from_name("anthropic"),
            Some(Provider::Anthropic)
        ));
        // openrouter shows up as custom
        let or = provider_from_name("openrouter-test-uniq").expect("custom registered");
        match or {
            Provider::Custom {
                name,
                base_url,
                api_key_env,
            } => {
                assert_eq!(name, "openrouter-test-uniq");
                assert!(base_url.ends_with("/chat/completions"));
                assert_eq!(api_key_env.as_deref(), Some("OPENROUTER_API_KEY"));
            }
            _ => panic!("Expected Provider::Custom"),
        }
    }
}

#[cfg(test)]
mod subscription_endpoint_tests {
    use crate::auth::{AuthEntry, AuthStore};

    /// `try_subscription_auth` carries no endpoint of its own, the URL a
    /// subscription request is posted to is only ever the one `resolve_auth`
    /// returned beside the token. That is what keeps a Copilot
    /// credential from reaching a URL that did not issue it. The contract only
    /// holds while every supported subscription names its own endpoint, so pin
    /// it: a subscription that resolves a token with no URL is now skipped, and
    /// the failure would otherwise be silent.
    #[tokio::test]
    async fn resolve_auth_names_an_endpoint_for_every_supported_subscription() {
        let now = chrono::Utc::now();
        let mut store = AuthStore::default();
        store.entries.insert(
            "copilot".to_string(),
            AuthEntry::ApiKey {
                key: "gho_test_token".to_string(),
            },
        );
        // Seed the transient Copilot token cache so the arm answers from memory
        // instead of exchanging a GitHub token over the network.
        store.copilot_cache = Some(("copilot_api_token".to_string(), now.timestamp() + 3_600));

        // Every name `try_subscription_auth` can ask for.
        for sub_name in ["copilot"] {
            let resolved = crate::auth::resolve_auth(&mut store, sub_name)
                .await
                .unwrap_or_else(|err| panic!("resolve_auth({sub_name}) failed: {err}"))
                .unwrap_or_else(|| panic!("resolve_auth({sub_name}) found no credential"));
            let endpoint = resolved
                .1
                .unwrap_or_else(|| panic!("{sub_name} resolved a token without an endpoint"));
            assert!(
                endpoint.starts_with("https://"),
                "{sub_name} endpoint must be HTTPS, got {endpoint}"
            );
        }
    }
}
