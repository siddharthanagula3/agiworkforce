use anyhow::{bail, Result};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalProviderProbe {
    pub provider: String,
    pub base_url: String,
    pub running: bool,
    pub models: Vec<DiscoveredLocalModel>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModel>,
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

pub async fn discover_all(config: &CliConfig) -> Vec<LocalProviderProbe> {
    let client = reqwest::Client::builder()
        .timeout(LOCAL_MODEL_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let ollama = configured_local_base_url(config, "ollama");
    let lmstudio = configured_local_base_url(config, "lmstudio");
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
                    models,
                    error: None,
                }
            }
            Err(error) => failed_probe(
                "ollama",
                safe_base,
                format!("invalid /api/tags JSON: {error}"),
            ),
        },
        Ok(resp) => failed_probe(
            "ollama",
            safe_base,
            format!("/api/tags returned HTTP {}", resp.status()),
        ),
        Err(error) => failed_probe(
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
    let safe_base = normalize_openai_base_url(base_url);
    if !is_safe_local_base_url(&safe_base) {
        return blocked_probe(provider, safe_base);
    }

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
                    models,
                    error: None,
                }
            }
            Err(error) => failed_probe(
                provider,
                safe_base,
                format!("invalid /v1/models JSON: {error}"),
            ),
        },
        Ok(resp) => failed_probe(
            provider,
            safe_base,
            format!("/v1/models returned HTTP {}", resp.status()),
        ),
        Err(error) => failed_probe(
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
) -> Result<()> {
    let probe = match provider {
        "ollama" => probe_ollama(client, base_url).await,
        "lmstudio" => probe_openai_compatible_local(client, provider, base_url).await,
        _ => return Ok(()),
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

    if probe.models.iter().any(|candidate| candidate.id == model) {
        return Ok(());
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

fn is_safe_local_base_url(base_url: &str) -> bool {
    crate::models::provider_dispatch::is_safe_provider_base_url(base_url)
        && base_url.starts_with("http://")
}

fn blocked_probe(provider: &str, base_url: String) -> LocalProviderProbe {
    failed_probe(
        provider,
        base_url,
        "blocked unsafe local model URL; use http://localhost, http://127.0.0.1, or http://[::1]"
            .to_string(),
    )
}

fn failed_probe(provider: &str, base_url: String, error: String) -> LocalProviderProbe {
    LocalProviderProbe {
        provider: provider.to_string(),
        base_url,
        running: false,
        models: Vec::new(),
        error: Some(error),
    }
}
