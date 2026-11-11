use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::config::CliConfig;

const OLLAMA_DEFAULT_BASE_URL: &str = "http://localhost:11434";
const LMSTUDIO_DEFAULT_BASE_URL: &str = "http://localhost:1234/v1";
const LOCAL_MODEL_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredLocalModel {
    pub id: String,
    pub provider: String,
    pub base_url: String,
    pub source: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalProbeHealth {
    Running,
    Unreachable,
    Faulty,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalProviderProbe {
    pub provider: String,
    pub base_url: String,
    pub running: bool,
    pub health: LocalProbeHealth,
    pub models: Vec<DiscoveredLocalModel>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaShowResponse {
    #[serde(default)]
    capabilities: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    #[serde(default)]
    data: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: String,
}

pub fn configured_local_base_url(config: &CliConfig, provider: &str) -> String {
    match provider {
        "ollama" => config
            .base_url("ollama")
            .unwrap_or_else(|| OLLAMA_DEFAULT_BASE_URL.to_string()),
        "lmstudio" => config
            .base_url("lmstudio")
            .unwrap_or_else(|| LMSTUDIO_DEFAULT_BASE_URL.to_string()),
        _ => String::new(),
    }
}

pub(crate) fn local_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
}

pub async fn discover_all(config: &CliConfig) -> Vec<LocalProviderProbe> {
    let client = local_client_builder()
        .timeout(LOCAL_MODEL_TIMEOUT)
        .build()
        .context("failed to build isolated Local discovery client");
    discover_all_with_client(config, client).await
}

async fn discover_all_with_client(
    config: &CliConfig,
    client: Result<reqwest::Client>,
) -> Vec<LocalProviderProbe> {
    let ollama = configured_local_base_url(config, "ollama");
    let lmstudio = configured_local_base_url(config, "lmstudio");
    let client = match client {
        Ok(client) => client,
        Err(error) => {
            return [("ollama", ollama), ("lmstudio", lmstudio)]
                .into_iter()
                .map(|(provider, base_url)| {
                    failed_probe(
                        LocalProbeHealth::Faulty,
                        provider,
                        base_url,
                        error.to_string(),
                    )
                })
                .collect();
        }
    };
    let (ollama_probe, lmstudio_probe) = tokio::join!(
        probe_ollama(&client, &ollama),
        probe_openai_compatible_local(&client, "lmstudio", &lmstudio)
    );
    vec![ollama_probe, lmstudio_probe]
}

pub fn discovered_models(probes: &[LocalProviderProbe]) -> Vec<DiscoveredLocalModel> {
    let mut models: Vec<DiscoveredLocalModel> = probes
        .iter()
        .flat_map(|probe| probe.models.clone())
        .collect();
    models.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.id.cmp(&b.id)));
    models.dedup_by(|a, b| a.provider == b.provider && a.id == b.id);
    models
}

pub fn select_discovered_model<'a>(
    models: &'a [DiscoveredLocalModel],
    model: &str,
    current_provider: &str,
) -> Result<Option<&'a DiscoveredLocalModel>> {
    let ollama_default_tag = (!model.contains(':')).then(|| format!("{model}:latest"));
    let mut matches: Vec<&DiscoveredLocalModel> = models
        .iter()
        .filter(|candidate| {
            candidate.id == model
                || (candidate.provider == "ollama"
                    && ollama_default_tag.as_deref() == Some(candidate.id.as_str()))
        })
        .collect();
    matches.sort_by_key(|candidate| candidate.id != model);
    let Some(first) = matches.first().copied() else {
        return Ok(None);
    };
    if matches
        .iter()
        .all(|candidate| candidate.provider == first.provider)
    {
        return Ok(Some(first));
    }
    if let Some(current) = matches
        .iter()
        .copied()
        .find(|candidate| candidate.provider == current_provider)
    {
        return Ok(Some(current));
    }
    let mut providers: Vec<&str> = matches
        .iter()
        .map(|candidate| candidate.provider.as_str())
        .collect();
    providers.sort_unstable();
    providers.dedup();
    bail!(
        "model '{model}' is installed in several local providers ({}); switch to one of them first or run `agi models set {model} --provider <provider>`",
        providers.join(", ")
    )
}

pub async fn probe_ollama(client: &reqwest::Client, base_url: &str) -> LocalProviderProbe {
    let safe_base = normalize_ollama_host_root(base_url);
    if !is_safe_local_base_url(&safe_base) {
        return blocked_probe("ollama", safe_base);
    }

    let url = format!("{}/api/tags", safe_base.trim_end_matches('/'));
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<OllamaTagsResponse>().await {
            Ok(body) => {
                let mut models = body
                    .models
                    .into_iter()
                    .filter_map(|model| model.name.or(model.model))
                    .map(|id| DiscoveredLocalModel {
                        id,
                        provider: "ollama".to_string(),
                        base_url: safe_base.clone(),
                        source: "ollama:/api/tags".to_string(),
                    })
                    .collect::<Vec<_>>();
                models.sort_by(|a, b| a.id.cmp(&b.id));
                models.dedup_by(|a, b| a.id == b.id);
                LocalProviderProbe {
                    provider: "ollama".to_string(),
                    base_url: safe_base,
                    running: true,
                    health: LocalProbeHealth::Running,
                    models,
                    error: None,
                }
            }
            Err(error) => failed_probe(
                LocalProbeHealth::Faulty,
                "ollama",
                safe_base,
                format!("invalid /api/tags JSON: {error}"),
            ),
        },
        Ok(resp) => failed_probe(
            LocalProbeHealth::Faulty,
            "ollama",
            safe_base,
            format!("/api/tags returned HTTP {}", resp.status()),
        ),
        Err(error) => failed_probe(
            LocalProbeHealth::Unreachable,
            "ollama",
            safe_base,
            format!(
                "not reachable: {error}. Start Ollama, then run `ollama pull <model>` if needed."
            ),
        ),
    }
}

pub async fn probe_openai_compatible_local(
    client: &reqwest::Client,
    provider: &str,
    base_url: &str,
) -> LocalProviderProbe {
    let safe_base = match validated_openai_local_base_url(base_url) {
        Ok(base_url) => base_url,
        Err(_) => return blocked_probe(provider, normalize_openai_base_url(base_url)),
    };

    let url = openai_models_url(&safe_base);
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<OpenAiModelsResponse>().await {
            Ok(body) => {
                let mut models = body
                    .data
                    .into_iter()
                    .map(|model| DiscoveredLocalModel {
                        id: model.id,
                        provider: provider.to_string(),
                        base_url: safe_base.clone(),
                        source: format!("{provider}:/v1/models"),
                    })
                    .collect::<Vec<_>>();
                models.sort_by(|a, b| a.id.cmp(&b.id));
                models.dedup_by(|a, b| a.id == b.id);
                LocalProviderProbe {
                    provider: provider.to_string(),
                    base_url: safe_base,
                    running: true,
                    health: LocalProbeHealth::Running,
                    models,
                    error: None,
                }
            }
            Err(error) => failed_probe(
                LocalProbeHealth::Faulty,
                provider,
                safe_base,
                format!("invalid /v1/models JSON: {error}"),
            ),
        },
        Ok(resp) => failed_probe(
            LocalProbeHealth::Faulty,
            provider,
            safe_base,
            format!("/v1/models returned HTTP {}", resp.status()),
        ),
        Err(error) => failed_probe(
            LocalProbeHealth::Unreachable,
            provider,
            safe_base,
            format!("not reachable: {error}. Start the local server and load a model."),
        ),
    }
}

pub async fn ensure_local_model_available(
    client: &reqwest::Client,
    provider: &str,
    base_url: &str,
    model: &str,
) -> Result<String> {
    let probe = match provider {
        "ollama" => probe_ollama(client, base_url).await,
        "lmstudio" => probe_openai_compatible_local(client, provider, base_url).await,
        _ => bail!("unsupported local model provider: {provider}"),
    };

    if !probe.running {
        bail!(
            "{} at {} is not available: {}",
            probe.provider,
            probe.base_url,
            probe
                .error
                .unwrap_or_else(|| "server did not respond".to_string())
        );
    }

    let ollama_default_tag =
        (provider == "ollama" && !model.contains(':')).then(|| format!("{model}:latest"));
    if probe.models.iter().any(|candidate| {
        candidate.id == model || ollama_default_tag.as_deref() == Some(candidate.id.as_str())
    }) {
        return Ok(probe.base_url);
    }

    let installed = if probe.models.is_empty() {
        "no installed models reported".to_string()
    } else {
        probe
            .models
            .iter()
            .map(|candidate| candidate.id.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    };
    bail!(
        "{} model '{}' is not installed at {} ({installed}). Select an installed model with `agi models scan`, or pull/load the model first.",
        probe.provider,
        model,
        probe.base_url
    )
}

pub async fn ollama_model_supports_tools(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
) -> Result<bool> {
    let safe_base = normalize_ollama_host_root(base_url);
    if !is_safe_local_base_url(&safe_base) {
        bail!(
            "blocked unsafe Ollama URL for model capability check: {}",
            safe_base
        );
    }

    let url = format!("{}/api/show", safe_base.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "model": model }))
        .send()
        .await
        .with_context(|| format!("failed to query Ollama model capabilities at {url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("/api/show returned HTTP {status}: {body}");
    }

    let body = resp
        .json::<OllamaShowResponse>()
        .await
        .context("invalid Ollama /api/show JSON")?;
    Ok(ollama_capabilities_support_tools(&body.capabilities))
}

fn ollama_capabilities_support_tools(capabilities: &[String]) -> bool {
    capabilities
        .iter()
        .any(|capability| capability.eq_ignore_ascii_case("tools"))
}

pub fn format_probe_report(probes: &[LocalProviderProbe]) -> String {
    let mut out = String::from("Local model servers\n");
    for probe in probes {
        let status = if probe.running {
            "running"
        } else {
            "not running"
        };
        out.push_str(&format!(
            "\n{}  {}  {}\n",
            probe.provider, status, probe.base_url
        ));
        if let Some(error) = &probe.error {
            out.push_str(&format!("  error: {error}\n"));
        }
        if probe.models.is_empty() {
            out.push_str("  models: none discovered\n");
        } else {
            out.push_str("  models:\n");
            for model in &probe.models {
                out.push_str(&format!("    - {}\n", model.id));
            }
        }
    }
    out
}

pub fn format_discovered_models(models: &[DiscoveredLocalModel]) -> String {
    if models.is_empty() {
        return "No local models discovered. Start Ollama or LM Studio, then run `agi models scan` again.".to_string();
    }
    let mut out = String::from("Discovered local models\n");
    for model in models {
        out.push_str(&format!(
            "  {:<12} {:<36} {}\n",
            model.provider, model.id, model.base_url
        ));
    }
    out
}

fn normalize_ollama_host_root(base_url: &str) -> String {
    let mut base = strip_chat_completions(base_url.trim())
        .trim_end_matches('/')
        .to_string();
    for suffix in ["/v1", "/api"] {
        if base.ends_with(suffix) {
            base.truncate(base.len() - suffix.len());
        }
    }
    if base.is_empty() {
        OLLAMA_DEFAULT_BASE_URL.to_string()
    } else {
        base
    }
}

fn normalize_openai_base_url(base_url: &str) -> String {
    let base = strip_chat_completions(base_url.trim())
        .trim_end_matches('/')
        .to_string();
    if base.is_empty() {
        LMSTUDIO_DEFAULT_BASE_URL.to_string()
    } else {
        base
    }
}

fn validated_openai_local_base_url(base_url: &str) -> Result<String> {
    let normalized = normalize_openai_base_url(base_url);
    if !is_safe_local_base_url(&normalized) {
        bail!("blocked unsafe local OpenAI-compatible URL: {}", normalized);
    }
    let parsed = reqwest::Url::parse(&normalized)
        .with_context(|| format!("invalid local OpenAI-compatible URL: {normalized}"))?;
    if parsed.query().is_some() || parsed.fragment().is_some() {
        bail!(
            "local OpenAI-compatible URL must not contain a query or fragment: {}",
            normalized
        );
    }
    Ok(normalized)
}

fn strip_chat_completions(base_url: &str) -> &str {
    base_url
        .strip_suffix("/chat/completions")
        .unwrap_or(base_url)
}

fn openai_models_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}

/// Build the chat-completions endpoint for a loopback OpenAI-compatible server.
///
/// The input may be a server root, a `/v1` base, or an existing full
/// `/chat/completions` URL. The returned endpoint always derives from the same
/// normalized and validated local base used by discovery and availability
/// checks.
pub fn openai_chat_completions_url(base_url: &str) -> Result<String> {
    let safe_base = validated_openai_local_base_url(base_url)?;
    let base = safe_base.trim_end_matches('/');
    if base.ends_with("/v1") {
        Ok(format!("{base}/chat/completions"))
    } else {
        Ok(format!("{base}/v1/chat/completions"))
    }
}

fn is_safe_local_base_url(base_url: &str) -> bool {
    crate::models::provider_dispatch::is_safe_provider_base_url(base_url)
        && base_url.starts_with("http://")
}

fn blocked_probe(provider: &str, base_url: String) -> LocalProviderProbe {
    failed_probe(
        LocalProbeHealth::Blocked,
        provider,
        base_url,
        "blocked unsafe local model URL; use http://localhost, http://127.0.0.1, or http://[::1]"
            .to_string(),
    )
}

fn failed_probe(
    health: LocalProbeHealth,
    provider: &str,
    base_url: String,
    error: String,
) -> LocalProviderProbe {
    LocalProviderProbe {
        provider: provider.to_string(),
        base_url,
        running: false,
        health,
        models: Vec::new(),
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed(provider: &str, id: &str) -> DiscoveredLocalModel {
        DiscoveredLocalModel {
            id: id.to_string(),
            provider: provider.to_string(),
            base_url: "http://localhost:1".to_string(),
            source: format!("{provider}:fixture"),
        }
    }

    #[test]
    fn an_uncataloged_lmstudio_model_is_selectable_from_discovery() {
        let models = vec![
            installed("lmstudio", "local-fixture-a"),
            installed("lmstudio", "local-fixture-b"),
        ];
        let selected = select_discovered_model(&models, "local-fixture-b", "lmstudio")
            .expect("unambiguous")
            .expect("installed");
        assert_eq!(selected.provider, "lmstudio");
        assert_eq!(selected.id, "local-fixture-b");
    }

    #[test]
    fn an_ollama_model_named_without_its_default_tag_is_selectable() {
        let models = vec![installed("ollama", "fixture-chat:latest")];
        let selected = select_discovered_model(&models, "fixture-chat", "lmstudio")
            .expect("unambiguous")
            .expect("installed");
        assert_eq!(selected.provider, "ollama");
    }

    #[test]
    fn a_model_no_local_server_reports_is_not_selected() {
        let models = vec![installed("lmstudio", "local-fixture-a")];
        assert!(
            select_discovered_model(&models, "hosted-fixture", "lmstudio")
                .expect("no ambiguity")
                .is_none()
        );
    }

    #[test]
    fn a_name_shared_by_two_local_providers_follows_the_current_provider_or_is_refused() {
        let models = vec![
            installed("lmstudio", "fixture-shared"),
            installed("ollama", "fixture-shared"),
        ];
        let selected = select_discovered_model(&models, "fixture-shared", "ollama")
            .expect("current provider breaks the tie")
            .expect("installed");
        assert_eq!(selected.provider, "ollama");

        let error = select_discovered_model(&models, "fixture-shared", "openai")
            .expect_err("two local providers and neither is current");
        let message = error.to_string();
        assert!(message.contains("lmstudio, ollama"), "{message}");
    }

    #[tokio::test]
    async fn discovery_client_failure_returns_no_models() {
        let probes = discover_all_with_client(
            &CliConfig::default(),
            Err(anyhow::anyhow!("fixture client build failure")),
        )
        .await;
        assert_eq!(probes.len(), 2);
        for probe in probes {
            assert_eq!(probe.health, LocalProbeHealth::Faulty);
            assert!(!probe.running);
            assert!(probe.models.is_empty());
            assert_eq!(probe.error.as_deref(), Some("fixture client build failure"));
        }
    }

    #[tokio::test]
    async fn local_discovery_and_capability_probes_do_not_follow_redirects() {
        use axum::{response::Redirect, routing::any, Router};
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };

        let target_hits = Arc::new(AtomicUsize::new(0));
        let target_hits_for_route = Arc::clone(&target_hits);
        let router = Router::new()
            .route(
                "/redirect-target",
                any(move || {
                    let target_hits = Arc::clone(&target_hits_for_route);
                    async move {
                        target_hits.fetch_add(1, Ordering::SeqCst);
                        "unexpected redirect"
                    }
                }),
            )
            .fallback(|| async { Redirect::temporary("/redirect-target") });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local redirect fixture");
        let base_url = format!("http://{}", listener.local_addr().expect("fixture address"));
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.expect("serve fixture");
        });
        let mut config = CliConfig::default();
        for provider in ["ollama", "lmstudio"] {
            config.providers.insert(
                provider.to_string(),
                crate::config::ProviderConfig {
                    api_key_env: None,
                    base_url: Some(base_url.clone()),
                },
            );
        }

        let probes = discover_all(&config).await;
        let client = local_client_builder()
            .timeout(LOCAL_MODEL_TIMEOUT)
            .build()
            .expect("isolated fixture client");
        let capability =
            ollama_model_supports_tools(&client, &base_url, "fixture-local-model").await;
        server.abort();

        assert_eq!(probes.len(), 2);
        for probe in probes {
            assert_eq!(probe.health, LocalProbeHealth::Faulty);
            assert!(!probe.running);
            assert!(probe.models.is_empty());
            assert!(probe.error.expect("redirect error").contains("307"));
        }
        assert!(capability
            .expect_err("redirect must fail")
            .to_string()
            .contains("307"));
        assert_eq!(target_hits.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn ollama_capabilities_detect_tool_support() {
        let capabilities = vec![
            "completion".to_string(),
            "vision".to_string(),
            "tools".to_string(),
        ];
        assert!(ollama_capabilities_support_tools(&capabilities));
    }

    #[test]
    fn ollama_capabilities_missing_tools_disables_tool_schemas() {
        let capabilities = vec!["completion".to_string(), "vision".to_string()];
        assert!(!ollama_capabilities_support_tools(&capabilities));
        assert!(!ollama_capabilities_support_tools(&[]));
    }

    #[test]
    fn openai_chat_endpoint_normalizes_custom_loopback_bases() {
        assert_eq!(
            openai_chat_completions_url("http://127.0.0.1:43123/v1")
                .expect("custom loopback /v1 base"),
            "http://127.0.0.1:43123/v1/chat/completions"
        );
        assert_eq!(
            openai_chat_completions_url("http://127.0.0.1:43123/v1/chat/completions")
                .expect("existing chat-completions endpoint"),
            "http://127.0.0.1:43123/v1/chat/completions"
        );
        assert_eq!(
            openai_chat_completions_url("http://localhost:43123").expect("custom loopback root"),
            "http://localhost:43123/v1/chat/completions"
        );
    }

    #[test]
    fn openai_chat_endpoint_rejects_non_loopback_or_ambiguous_urls() {
        assert!(openai_chat_completions_url("https://example.com/v1").is_err());
        assert!(openai_chat_completions_url("http://127.0.0.1:43123/v1?tenant=other").is_err());
    }
}
