use anyhow::Result;
use std::collections::HashMap;

use crate::config::CliConfig;
use crate::errors::CliError;

use super::{
    deepseek_provider, lmstudio_provider, mistral_provider, moonshot_provider, nvidia_provider,
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
        "zhipu" | "glm" => Some(zhipu_provider()),
        "lmstudio" | "lm-studio" | "lm_studio" => Some(lmstudio_provider()),
        "mistral" | "mistral-ai" | "mistralai" => Some(mistral_provider()),
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
    m.starts_with("ollama:")
        || (m.contains(':') && !m.contains('/'))
        || m.starts_with("llama")
        || m.starts_with("codellama")
        || m.starts_with("qwen2")
        || m.starts_with("qwen3")
        || m.starts_with("gemma")
        || m.starts_with("phi")
        || m.starts_with("deepseek-r1")
        || m.starts_with("nomic-embed")
        || m.contains("command-r")
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
        Provider::Anthropic | Provider::Google => false,
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
/// fallback — without the top-level layer, `agi --model X exec "…"` silently
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

/// Resolve the API key for a provider, returning an error if required but missing.
pub(crate) fn resolve_key(config: &CliConfig, provider: &Provider) -> Result<Option<String>> {
    let name = provider_name(provider);
    match provider {
        Provider::Ollama(OllamaMode::Local) => Ok(None), // no key needed
        Provider::Ollama(OllamaMode::Cloud) => {
            let key = resolve_config_env_auth_key(config, name, "OLLAMA_API_KEY");
            if key.is_none() {
                return Err(CliError::auth(
                    name,
                    "No API key found. Run `agi login ollama-cloud` or set OLLAMA_API_KEY."
                        .to_string(),
                )
                .into());
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
                return Err(CliError::auth(
                    *pname,
                    format!(
                        "No API key found. Run `agi login {}` or set {}.",
                        pname, env_var
                    ),
                )
                .into());
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
                return Err(CliError::auth(
                    pname.clone(),
                    format!(
                        "No API key found. Run `agi login {}` or set {}.",
                        pname, env_var
                    ),
                )
                .into());
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
                return Err(CliError::auth(
                    name,
                    format!(
                        "No API key found. Run `agi login {}` or set {}.",
                        name, env_var
                    ),
                )
                .into());
            }
            Ok(key)
        }
    }
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
        "zhipu" | "glm" => vec!["zhipu", "glm"],
        "mistral" | "mistral-ai" | "mistralai" => vec!["mistral", "mistral-ai", "mistralai"],
        _ => Vec::new(),
    }
}

pub fn provider_name(provider: &Provider) -> &'static str {
    match provider {
        Provider::Anthropic => "anthropic",
        Provider::Google => "google",
        Provider::Ollama(OllamaMode::Local) => "ollama",
        Provider::Ollama(OllamaMode::Cloud) => "ollama_cloud",
        Provider::OpenAICompatible { name, .. } => name,
        // Custom providers have owned String names; we leak a static name only
        // for matching against config maps. Use the first registered custom
        // name here — callers needing the dynamic name should match on the
        // variant directly. Falls back to "custom" as a stable label.
        Provider::Custom { .. } => "custom",
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
/// LM Studio, Mistral) so users cannot accidentally hijack a native handler.
///
/// Each entry needs a `base_url`; `api_key_env` is optional (omit for keyless
/// local endpoints). Base URLs without `/chat/completions` get the path
/// appended automatically so users can provide either form.
pub fn register_custom_providers(config: &CliConfig) {
    const RESERVED: &[&str] = &[
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
        "mistral",
        "mistral-ai",
        "mistralai",
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
                "skipping custom provider — base_url must be https:// or http://(localhost|127.0.0.1|[::1])"
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
    if url.starts_with("https://") {
        return true;
    }
    if let Some(rest) = url.strip_prefix("http://") {
        // IPv6 hosts arrive bracketed: `http://[::1]:8000/v1`. Splitting on
        // ':' would chop the host to just `[`, mis-classifying loopback as
        // public. Detect the bracketed form explicitly and extract the
        // entire `[...]` segment as the host.
        let host = if rest.starts_with('[') {
            match rest.find(']') {
                Some(end) => rest[..=end].to_ascii_lowercase(),
                None => return false, // malformed — refuse rather than guess
            }
        } else {
            rest.split(['/', ':', '?', '#'])
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
        };
        return host == "localhost" || host == "127.0.0.1" || host == "[::1]";
    }
    false
}

// ---------------------------------------------------------------------------
// Subscription auth helpers
// ---------------------------------------------------------------------------

/// Try subscription auth (Copilot, ChatGPT Plus) for the given provider.
///
/// Returns `Some((token, url, subscription_name, account_id))` if subscription
/// auth is available, `None` otherwise.
pub(crate) async fn try_subscription_auth(
    provider: &Provider,
) -> Option<(String, String, String, Option<String>)> {
    let mut auth_store = crate::auth::load_auth().ok()?;

    // Determine which subscription providers are compatible with this Provider
    let subscription_names: &[&str] = match provider {
        Provider::OpenAICompatible { name: "openai", .. } => &["chatgpt", "copilot"],
        Provider::Anthropic => &["copilot"], // Copilot can proxy Claude models
        _ => return None,
    };

    for &sub_name in subscription_names {
        if let Ok(Some((token, base_url_override))) =
            crate::auth::resolve_auth(&mut auth_store, sub_name).await
        {
            let url = base_url_override.unwrap_or_else(|| default_subscription_url(sub_name));
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
            let account_id = auth_store.entries.get(sub_name).and_then(|e| match e {
                crate::auth::AuthEntry::OAuth { account_id, .. } => account_id.clone(),
                crate::auth::AuthEntry::ApiKey { .. } => None,
            });
            // Persist any token refreshes that happened during resolve_auth
            let _ = crate::auth::save_auth(&auth_store);
            return Some((token, url, sub_name.to_string(), account_id));
        }
    }

    // Persist any token refreshes even if none matched
    let _ = crate::auth::save_auth(&auth_store);
    None
}

/// Default API URL for a subscription provider.
pub(crate) fn default_subscription_url(name: &str) -> String {
    match name {
        "copilot" => "https://api.githubcopilot.com/chat/completions".to_string(),
        "chatgpt" => "https://chatgpt.com/backend-api/codex/responses".to_string(),
        _ => "https://api.openai.com/v1/chat/completions".to_string(),
    }
}

#[cfg(test)]
mod safe_provider_url_tests {
    use super::is_safe_provider_base_url;

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
    }

    #[test]
    fn http_external_is_blocked() {
        assert!(!is_safe_provider_base_url("http://example.com"));
        assert!(!is_safe_provider_base_url(
            "http://169.254.169.254/latest/meta-data"
        ));
        assert!(!is_safe_provider_base_url("http://192.168.1.1"));
        assert!(!is_safe_provider_base_url("http://0.0.0.0:8080"));
    }

    #[test]
    fn other_schemes_are_blocked() {
        assert!(!is_safe_provider_base_url("file:///etc/passwd"));
        assert!(!is_safe_provider_base_url("ftp://example.com"));
        assert!(!is_safe_provider_base_url("gopher://internal"));
        assert!(!is_safe_provider_base_url(""));
        assert!(!is_safe_provider_base_url("localhost:8080"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OllamaMode, Provider};

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
            detect_provider("llama3.1:8b"),
            Provider::Ollama(OllamaMode::Local)
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("mistral"))),
            "mistral"
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
            detect_provider("qwen2.5"),
            Provider::Ollama(OllamaMode::Local)
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("moonshot"))),
            "moonshot"
        );
        assert_eq!(
            provider_name(&detect_provider(&sample_model_for("zhipu"))),
            "zhipu"
        );
        assert!(try_detect_provider("claude-definitely-fake").is_none());
        assert!(try_detect_provider("gemini-definitely-fake").is_none());
        assert!(try_detect_provider("unknown-model").is_none());
        assert_eq!(provider_name(&detect_provider("unknown-model")), "openai");
    }

    #[test]
    fn test_provider_from_name_canonical_names() {
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
    fn mistral_provider_resolved_from_name() {
        assert_eq!(
            provider_name(&provider_from_name("mistral").unwrap()),
            "mistral"
        );
        assert_eq!(
            provider_name(&provider_from_name("mistral-ai").unwrap()),
            "mistral"
        );
        assert_eq!(
            provider_name(&provider_from_name("mistralai").unwrap()),
            "mistral"
        );
        // Verify MISTRAL_API_KEY is wired
        let p = provider_from_name("mistral").unwrap();
        let Provider::OpenAICompatible { api_key_env, .. } = &p else {
            panic!("Expected OpenAICompatible");
        };
        assert_eq!(*api_key_env, Some("MISTRAL_API_KEY"));
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
