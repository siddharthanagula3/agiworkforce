use anyhow::Result;
use std::collections::HashMap;

use crate::config::CliConfig;
use crate::errors::CliError;

use super::{
    deepseek_provider, lmstudio_provider, mistral_provider, moonshot_provider, openai_provider,
    perplexity_provider, qwen_provider, xai_provider, zhipu_provider, OllamaMode, Provider,
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
        _ => lookup_custom_provider(&lower),
    }
}

/// Detect the provider from a model name string.
///
/// Mistral / Codestral and other formerly-native providers now route through
/// the OpenAI-compatible variant (`Mistral` was dropped on 2026-05-03 because
/// no API key was wired anywhere in the platform).
pub fn detect_provider(model: &str) -> Provider {
    let m = model.to_lowercase();
    if m.starts_with("claude") || m.starts_with("anthropic") {
        Provider::Anthropic
    } else if m.starts_with("gpt")
        || m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.starts_with("chatgpt")
    {
        openai_provider()
    } else if m.starts_with("gemini") || m.starts_with("models/gemini") {
        Provider::Google
    } else if m.starts_with("mistral") || m.starts_with("codestral") {
        mistral_provider()
    } else if m.starts_with("grok") {
        xai_provider()
    } else if m.starts_with("deepseek") {
        deepseek_provider()
    } else if m.starts_with("kimi") || m.starts_with("moonshot") {
        moonshot_provider()
    } else if m.starts_with("glm") || m.starts_with("zhipu") {
        zhipu_provider()
    } else if m.starts_with("qwen") {
        qwen_provider()
    } else if m.contains("llama") || m.contains("phi") || m.contains("command-r") {
        // Local models commonly served via Ollama (default to local mode)
        Provider::Ollama(OllamaMode::Local)
    } else {
        // Default fallback: try local Ollama (most permissive — no key required)
        Provider::Ollama(OllamaMode::Local)
    }
}

/// Resolve the API key for a provider, returning an error if required but missing.
pub(crate) fn resolve_key(config: &CliConfig, provider: &Provider) -> Result<Option<String>> {
    let name = provider_name(provider);
    match provider {
        Provider::Ollama(OllamaMode::Local) => Ok(None), // no key needed
        Provider::Ollama(OllamaMode::Cloud) => {
            // Ollama Cloud requires OLLAMA_API_KEY. Fall back to env var if not in config.
            let key = config.resolve_api_key(name).or_else(|| {
                std::env::var("OLLAMA_API_KEY")
                    .ok()
                    .filter(|k| !k.is_empty())
            });
            if key.is_none() {
                return Err(CliError::auth(
                    name,
                    "No API key found. Set the OLLAMA_API_KEY environment variable.".to_string(),
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
            let key = config
                .resolve_api_key(pname)
                .or_else(|| std::env::var(env_var).ok().filter(|k| !k.is_empty()));
            if key.is_none() {
                return Err(CliError::auth(
                    *pname,
                    format!("No API key found. Set the {} environment variable.", env_var),
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
                .or_else(|| std::env::var(env_var).ok().filter(|k| !k.is_empty()));
            if key.is_none() {
                return Err(CliError::auth(
                    pname.clone(),
                    format!("No API key found. Set the {} environment variable.", env_var),
                )
                .into());
            }
            Ok(key)
        }
        Provider::Anthropic | Provider::Google => {
            let key = config.resolve_api_key(name);
            if key.is_none() {
                let env_var = config
                    .providers
                    .get(name)
                    .and_then(|p| p.api_key_env.as_deref())
                    .unwrap_or("UNKNOWN");
                return Err(CliError::auth(
                    name,
                    format!(
                        "No API key found. Set the {} environment variable.",
                        env_var
                    ),
                )
                .into());
            }
            Ok(key)
        }
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
static CUSTOM_PROVIDERS: once_cell::sync::Lazy<
    std::sync::RwLock<HashMap<String, Provider>>,
> = once_cell::sync::Lazy::new(|| std::sync::RwLock::new(HashMap::new()));

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
                _ => None,
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

    #[test]
    fn test_provider_detection() {
        assert_eq!(detect_provider("claude-opus-4-6"), Provider::Anthropic);
        assert_eq!(
            detect_provider("claude-sonnet-4-20250514"),
            Provider::Anthropic
        );
        assert_eq!(provider_name(&detect_provider("gpt-5.5")), "openai");
        assert_eq!(provider_name(&detect_provider("gpt-5.4-turbo")), "openai");
        assert_eq!(provider_name(&detect_provider("o3-mini")), "openai");
        assert_eq!(detect_provider("gemini-3-flash-preview"), Provider::Google);
        assert_eq!(detect_provider("models/gemini-pro"), Provider::Google);
        assert_eq!(
            detect_provider("llama3.1:8b"),
            Provider::Ollama(OllamaMode::Local)
        );
        // Mistral / Codestral now route through OpenAICompatible (no native variant).
        assert_eq!(provider_name(&detect_provider("mistral-large")), "mistral");
        assert_eq!(
            provider_name(&detect_provider("codestral-latest")),
            "mistral"
        );
        assert_eq!(provider_name(&detect_provider("grok-4.1")), "xai");
        assert_eq!(provider_name(&detect_provider("grok-beta")), "xai");
        assert_eq!(provider_name(&detect_provider("deepseek-chat")), "deepseek");
        assert_eq!(
            provider_name(&detect_provider("deepseek-reasoner")),
            "deepseek"
        );
        assert_eq!(provider_name(&detect_provider("qwen2.5")), "qwen");
        assert_eq!(provider_name(&detect_provider("kimi-k2")), "moonshot");
        assert_eq!(provider_name(&detect_provider("glm-4.6")), "zhipu");
        assert_eq!(
            detect_provider("unknown-model"),
            Provider::Ollama(OllamaMode::Local)
        );
    }

    #[test]
    fn test_provider_from_name_canonical_names() {
        assert!(matches!(
            provider_from_name("anthropic"),
            Some(Provider::Anthropic)
        ));
        assert_eq!(provider_name(&provider_from_name("openai").unwrap()), "openai");
        assert_eq!(provider_name(&provider_from_name("xai").unwrap()), "xai");
        assert_eq!(
            provider_name(&provider_from_name("deepseek").unwrap()),
            "deepseek"
        );
        assert_eq!(
            provider_name(&provider_from_name("perplexity").unwrap()),
            "perplexity"
        );
        assert_eq!(
            provider_name(&provider_from_name("qwen").unwrap()),
            "qwen"
        );
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
        // Aliases
        assert_eq!(provider_name(&provider_from_name("grok").unwrap()), "xai");
        assert_eq!(provider_name(&provider_from_name("kimi").unwrap()), "moonshot");
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
