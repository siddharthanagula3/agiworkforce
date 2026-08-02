//! Live AGI Workforce managed-gateway model discovery.
//!
//! The bundled catalog remains the offline metadata source, while the gateway's
//! OpenAI-compatible `/models` endpoint is authoritative for the models visible
//! to the signed-in account. Responses are additionally filtered through the
//! CLI developer-surface tier policy before they are exposed in the TUI.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::model_catalog::Model;
use crate::tier_cache::UserTier;

const DEFAULT_API_BASE: &str = "https://agiworkforce.com";
const FETCH_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_RESPONSE_BYTES: usize = 1_048_576;
const MAX_MODELS: usize = 512;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GatewayModel {
    pub id: String,
    #[serde(default)]
    pub owned_by: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub context_window: usize,
    #[serde(default, rename = "max_output")]
    pub max_output_tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GatewayCatalog {
    pub user_tier: String,
    pub authenticated: bool,
    pub models: Vec<GatewayModel>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    object: String,
    data: Vec<GatewayModel>,
    x_agi_workforce: GatewayMetadata,
}

#[derive(Debug, Deserialize)]
struct GatewayMetadata {
    user_tier: String,
}

fn models_endpoint(raw_base: &str) -> Result<String> {
    let base = crate::tier_cache::resolve_agi_api_base(raw_base).ok_or_else(|| {
        anyhow::anyhow!("managed model discovery requires a trusted AGI Workforce HTTPS host")
    })?;
    Ok(if base.ends_with("/api") {
        format!("{base}/llm/v1/models")
    } else {
        format!("{base}/api/llm/v1/models")
    })
}

async fn fetch_from_endpoint(
    client: &reqwest::Client,
    endpoint: &str,
    jwt: Option<&str>,
) -> Result<GatewayCatalog> {
    let mut request = client
        .get(endpoint)
        .header("Accept", "application/json")
        .header("X-Requested-With", "XMLHttpRequest");
    if let Some(jwt) = jwt.filter(|token| !token.is_empty()) {
        request = request.header("Authorization", format!("Bearer {jwt}"));
    }

    let response = request
        .send()
        .await
        .context("managed model discovery request failed")?;
    let status = response.status();
    if status.as_u16() == 401 {
        anyhow::bail!(
            "managed model discovery rejected the saved credential (HTTP 401); run `agi login`"
        );
    }
    if status.as_u16() == 403 {
        anyhow::bail!("managed model discovery credential lacks the models:read scope (HTTP 403)");
    }
    if !status.is_success() {
        anyhow::bail!("managed model discovery returned HTTP {}", status.as_u16());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        anyhow::bail!("managed model discovery response exceeded {MAX_RESPONSE_BYTES} bytes");
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("failed to read managed model discovery response")?;
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            anyhow::bail!("managed model discovery response exceeded {MAX_RESPONSE_BYTES} bytes");
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut payload: ModelsResponse = serde_json::from_slice(&bytes)
        .context("managed model discovery returned an invalid response")?;
    if payload.object != "list" {
        anyhow::bail!(
            "managed model discovery returned object '{}', expected 'list'",
            payload.object
        );
    }
    if payload.data.len() > MAX_MODELS {
        anyhow::bail!("managed model discovery returned more than {MAX_MODELS} models");
    }

    for model in &mut payload.data {
        model.id = model.id.trim().to_string();
    }
    let mut seen = HashSet::new();
    payload.data.retain(|model| {
        !model.id.is_empty()
            && model.id.len() <= 256
            && !model.id.chars().any(char::is_control)
            && seen.insert(model.id.clone())
    });

    Ok(GatewayCatalog {
        user_tier: payload.x_agi_workforce.user_tier,
        authenticated: jwt.is_some_and(|token| !token.is_empty()),
        models: payload.data,
    })
}

/// Discover the managed models visible to the current account.
///
/// A configured credential is never retried anonymously after a 401/403. The
/// trusted-host check runs before the credential can be attached.
pub async fn discover_gateway_models() -> Result<GatewayCatalog> {
    let raw_base =
        std::env::var("AGIWORKFORCE_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_string());
    let endpoint = models_endpoint(&raw_base)?;
    let jwt = crate::tier_cache::load_jwt();
    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .build()
        .context("failed to initialize managed model discovery client")?;
    fetch_from_endpoint(&client, &endpoint, jwt.as_deref()).await
}

fn user_tier(value: &str) -> UserTier {
    match value.trim().to_ascii_lowercase().as_str() {
        "basic" => UserTier::Basic,
        "pro" => UserTier::Pro,
        "max" => UserTier::Max,
        "max_15x" | "max15x" => UserTier::Max15x,
        "team" => UserTier::Team,
        "enterprise" => UserTier::Enterprise,
        _ => UserTier::Free,
    }
}

/// Convert a live gateway response into Cloud rows for the model picker.
///
/// The server response supplies availability and limits. Bundled metadata
/// supplies display/capability/pricing details when the client knows the model.
/// Unknown newly-launched gateway models still remain selectable with safe
/// capability defaults instead of being hidden until the next CLI release.
pub fn picker_models(catalog: &GatewayCatalog) -> Vec<Model> {
    let tier = user_tier(&catalog.user_tier);
    if !matches!(
        tier,
        UserTier::Pro | UserTier::Max | UserTier::Max15x | UserTier::Team | UserTier::Enterprise
    ) {
        return Vec::new();
    }
    let bundled = crate::model_catalog::catalog();
    catalog
        .models
        .iter()
        .map(|remote| {
            let mut model = bundled.find(&remote.id).cloned().unwrap_or_else(|| Model {
                id: remote.id.clone(),
                provider: "agi-cloud".to_string(),
                display_name: remote.id.clone(),
                context_window: remote.context_window,
                max_output_tokens: remote.max_output_tokens,
                input_price_per_1m: 0.0,
                output_price_per_1m: 0.0,
                cache_read_price_per_1m: 0.0,
                cache_write_price_per_1m: 0.0,
                supports_tools: false,
                supports_vision: false,
                supports_reasoning: false,
                supports_audio_input: false,
                supports_audio_output: false,
                supports_pdf: false,
                release_date: String::new(),
                status: "active".to_string(),
                cloud_eligible: true,
                requires_environment: None,
            });
            model.provider = "agi-cloud".to_string();
            model.cloud_eligible = true;
            if remote.context_window > 0 {
                model.context_window = remote.context_window;
            }
            if remote.max_output_tokens > 0 {
                model.max_output_tokens = remote.max_output_tokens;
            }
            model
        })
        .collect()
}

static LIVE_CATALOG: Mutex<Option<GatewayCatalog>> = Mutex::new(None);

pub fn store_live_catalog(catalog: GatewayCatalog) {
    if let Ok(mut slot) = LIVE_CATALOG.lock() {
        *slot = Some(catalog);
    }
}

pub fn cached_picker_models() -> Vec<Model> {
    LIVE_CATALOG
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(picker_models))
        .unwrap_or_default()
}

pub fn cached_user_tier() -> Option<UserTier> {
    LIVE_CATALOG
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|catalog| user_tier(&catalog.user_tier)))
}

pub fn cached_model_is_available(model_id: &str) -> bool {
    LIVE_CATALOG
        .lock()
        .ok()
        .and_then(|slot| {
            slot.as_ref().map(|catalog| {
                picker_models(catalog)
                    .iter()
                    .any(|model| model.id == model_id)
            })
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use axum::{
        extract::Request, http::StatusCode, response::IntoResponse, routing::get, Json, Router,
    };

    use super::*;

    async fn spawn_server(router: Router) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test server");
        let address = listener.local_addr().expect("test server address");
        let server = axum::serve(listener, router);
        let task = tokio::spawn(async move {
            server.await.expect("test server");
        });
        (format!("http://{address}/models"), task)
    }

    #[test]
    fn endpoint_handles_root_and_api_bases() {
        assert_eq!(
            models_endpoint("https://agiworkforce.com").expect("root endpoint"),
            "https://agiworkforce.com/api/llm/v1/models"
        );
        assert_eq!(
            models_endpoint("https://api.agiworkforce.com/api").expect("api endpoint"),
            "https://api.agiworkforce.com/api/llm/v1/models"
        );
        assert!(models_endpoint("https://attacker.example").is_err());
    }

    #[tokio::test]
    async fn authenticated_discovery_sends_token_and_parses_bounded_catalog() {
        let router = Router::new().route(
            "/models",
            get(|request: Request| async move {
                assert_eq!(
                    request
                        .headers()
                        .get("authorization")
                        .and_then(|value| value.to_str().ok()),
                    Some("Bearer secret-token")
                );
                Json(serde_json::json!({
                    "object": "list",
                    "data": [
                        {"id": "model-a", "owned_by": "openai", "tier": "pro", "context_window": 128000, "max_output": 8192},
                        {"id": "model-a", "owned_by": "openai", "tier": "pro", "context_window": 128000, "max_output": 8192},
                        {"id": "model-b", "owned_by": "anthropic", "tier": "max", "context_window": 200000, "max_output": 64000},
                        {"id": "bad\u{001b}[2J", "owned_by": "untrusted", "tier": "pro"}
                    ],
                    "x_agi_workforce": {"user_tier": "max"}
                }))
            }),
        );
        let (endpoint, server) = spawn_server(router).await;

        let client = reqwest::Client::new();
        let catalog = fetch_from_endpoint(&client, &endpoint, Some("secret-token"))
            .await
            .expect("discover models");
        server.abort();

        assert!(catalog.authenticated);
        assert_eq!(catalog.user_tier, "max");
        assert_eq!(catalog.models.len(), 2, "duplicate ids are removed");
        assert_eq!(catalog.models[1].max_output_tokens, 64_000);
    }

    #[tokio::test]
    async fn rejected_credential_is_not_silently_downgraded() {
        let router = Router::new().route(
            "/models",
            get(|| async move { (StatusCode::UNAUTHORIZED, "expired").into_response() }),
        );
        let (endpoint, server) = spawn_server(router).await;
        let error = fetch_from_endpoint(&reqwest::Client::new(), &endpoint, Some("expired"))
            .await
            .expect_err("401 must be surfaced");
        server.abort();
        assert!(error.to_string().contains("run `agi login`"));
    }

    #[tokio::test]
    async fn oversized_discovery_response_is_rejected_before_parsing() {
        let router = Router::new().route(
            "/models",
            get(|| async move { vec![b'x'; MAX_RESPONSE_BYTES + 1] }),
        );
        let (endpoint, server) = spawn_server(router).await;
        let error = fetch_from_endpoint(&reqwest::Client::new(), &endpoint, None)
            .await
            .expect_err("oversized body must be rejected");
        server.abort();
        assert!(error.to_string().contains("exceeded"));
    }

    #[test]
    fn picker_models_apply_cli_tier_policy_and_cloud_transport() {
        let pro_model = crate::model_catalog::tier_allowed_models("pro_additions")
            .into_iter()
            .next()
            .or_else(|| {
                crate::model_catalog::tier_allowed_models("economy")
                    .into_iter()
                    .next()
            })
            .expect("managed catalog model");
        let remote = GatewayModel {
            id: pro_model.clone(),
            owned_by: "upstream".to_string(),
            tier: "pro".to_string(),
            context_window: 321_000,
            max_output_tokens: 12_345,
        };

        let free = GatewayCatalog {
            user_tier: "free".to_string(),
            authenticated: false,
            models: vec![remote.clone()],
        };
        assert!(picker_models(&free).is_empty());

        let pro = GatewayCatalog {
            user_tier: "pro".to_string(),
            authenticated: true,
            models: vec![remote],
        };
        let models = picker_models(&pro);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, pro_model);
        assert_eq!(models[0].provider, "agi-cloud");
        assert_eq!(models[0].context_window, 321_000);
        assert_eq!(models[0].max_output_tokens, 12_345);
    }
}
