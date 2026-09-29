use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use super::pkce::{generate_pkce, generate_random_string};
use crate::config::OAuthConfig;
use crate::hooks::{BrowserAuthorizer, ClientHooks, ClientRegistration, OAuthToken};
use crate::security::{self, ValidatedEndpoint};

pub const CLIENT_METADATA_DOCUMENT_PATH: &str = "/.well-known/oauth-client-metadata";

const OAUTH_INTERACTIVE_TIMEOUT: Duration = Duration::from_secs(120);
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const CALLBACK_PATH: &str = "/callback";

pub fn client_metadata_document_url(origin: &str, surface: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(origin).ok()?;
    if parsed.scheme() != "https" || parsed.host_str().is_none() {
        return None;
    }
    Some(format!(
        "{}{CLIENT_METADATA_DOCUMENT_PATH}/{surface}",
        parsed.origin().ascii_serialization()
    ))
}

fn pinned_client(endpoint: &ValidatedEndpoint, purpose: &str) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(&endpoint.host, &endpoint.addrs)
        .build()
        .with_context(|| format!("build reqwest client for {purpose}"))
}

async fn checked_endpoint(url: &str, what: &str, anchor: &str) -> Result<ValidatedEndpoint> {
    security::resolve_validated_endpoint(url, anchor)
        .await
        .with_context(|| format!("{what} {url}"))
}

async fn failure_detail(resp: reqwest::Response, what: &str) -> String {
    let body = security::read_body_capped(resp, what)
        .await
        .unwrap_or_default();
    oauth_error_detail(&body).unwrap_or_else(|| "response body withheld".to_string())
}

fn oauth_error_detail(body: &[u8]) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_slice(body).ok()?;
    let code = parsed.get("error")?.as_str()?;
    let mut detail = clamp(code, 80);
    if let Some(description) = parsed.get("error_description").and_then(|d| d.as_str()) {
        detail.push_str(": ");
        detail.push_str(&clamp(description, 200));
    }
    Some(detail)
}

fn clamp(text: &str, max_chars: usize) -> String {
    let cleaned: String = text.chars().filter(|c| !c.is_control()).collect();
    match cleaned.char_indices().nth(max_chars) {
        Some((idx, _)) => format!("{}…", &cleaned[..idx]),
        None => cleaned,
    }
}

fn confidential_client_secret<'a>(
    oauth_cfg: &'a OAuthConfig,
    token_url: &str,
) -> Result<Option<&'a str>> {
    let Some(secret) = oauth_cfg.client_secret.as_deref() else {
        return Ok(None);
    };
    let pinned = oauth_cfg.token_url.as_deref().ok_or_else(|| {
        anyhow!(
            "refusing to send the configured client_secret to the discovered token endpoint \
             {token_url}, set [auth.token_url] so the secret only ever reaches an endpoint you named"
        )
    })?;
    security::enforce_same_origin(pinned, token_url, "token endpoint")
        .context("refusing to send the configured client_secret to another origin")?;
    Ok(Some(secret))
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProtectedResourceMetadata {
    #[serde(default)]
    pub authorization_servers: Vec<String>,
    #[serde(default)]
    pub resource: Option<String>,
    #[serde(default)]
    pub scopes_supported: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AsMetadata {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default)]
    pub registration_endpoint: Option<String>,
    #[serde(default)]
    pub revocation_endpoint: Option<String>,
    #[serde(default)]
    pub code_challenge_methods_supported: Vec<String>,
    #[serde(default)]
    pub client_id_metadata_document_supported: bool,
    #[serde(default)]
    pub authorization_response_iss_parameter_supported: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegisteredClient {
    pub client_id: String,
}

pub fn parse_resource_metadata_url(www_authenticate: Option<&str>) -> Option<String> {
    parse_param(www_authenticate?, "resource_metadata")
}

fn parse_param(header: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=");
    let lower = header.to_ascii_lowercase();
    let idx = lower.find(&needle.to_ascii_lowercase())?;
    let after = &header[idx + needle.len()..];
    if let Some(stripped) = after.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        let end = after
            .find(|c: char| c == ',' || c.is_whitespace())
            .unwrap_or(after.len());
        Some(after[..end].to_string())
    }
}

pub fn parse_insufficient_scope(www_authenticate: Option<&str>) -> Option<String> {
    let raw = www_authenticate?;
    let err = parse_param(raw, "error")?;
    if err.eq_ignore_ascii_case("insufficient_scope") {
        parse_param(raw, "scope")
    } else {
        None
    }
}

fn challenge_scope(www_authenticate: Option<&str>) -> Option<String> {
    parse_param(www_authenticate?, "scope").filter(|scope| !scope.trim().is_empty())
}

pub async fn discover_protected_resource(
    server_url: &str,
    www_authenticate: Option<&str>,
) -> Result<(String, ProtectedResourceMetadata)> {
    let candidates = match parse_resource_metadata_url(www_authenticate) {
        Some(advertised) => {
            security::enforce_same_origin(server_url, &advertised, "protected-resource metadata")
                .with_context(|| {
                format!(
                    "SSRF protection: the WWW-Authenticate challenge from {server_url} named \
                         protected-resource metadata on another origin"
                )
            })?;
            vec![advertised]
        }
        None => protected_resource_candidates(server_url)?,
    };

    for metadata_url in candidates {
        let Some(body) =
            fetch_metadata(&metadata_url, server_url, "protected-resource metadata").await?
        else {
            continue;
        };
        let meta: ProtectedResourceMetadata = serde_json::from_slice(&body)
            .with_context(|| format!("parse protected-resource metadata at {metadata_url}"))?;
        if meta.authorization_servers.is_empty() {
            bail!(
                "protected-resource metadata at {metadata_url} contains no authorization_servers"
            );
        }
        return Ok((metadata_url, meta));
    }
    bail!("no protected-resource metadata was found for {server_url}")
}

fn protected_resource_candidates(server_url: &str) -> Result<Vec<String>> {
    let parsed = reqwest::Url::parse(server_url)
        .with_context(|| format!("parse MCP server URL {server_url}"))?;
    let origin = parsed.origin().ascii_serialization();
    let path = parsed.path().trim_end_matches('/');
    let mut candidates = Vec::new();
    if !path.is_empty() {
        candidates.push(format!(
            "{origin}/.well-known/oauth-protected-resource{path}"
        ));
    }
    candidates.push(format!("{origin}/.well-known/oauth-protected-resource"));
    Ok(candidates)
}

pub async fn discover_authorization_server(issuer: &str, server_url: &str) -> Result<AsMetadata> {
    for metadata_url in authorization_server_candidates(issuer)? {
        let Some(body) =
            fetch_metadata(&metadata_url, server_url, "authorization-server metadata").await?
        else {
            continue;
        };
        let meta: AsMetadata = serde_json::from_slice(&body)
            .with_context(|| format!("parse AS metadata at {metadata_url}"))?;
        if meta.issuer != issuer {
            bail!(
                "authorization-server metadata at {metadata_url} names issuer {} instead of {issuer}, refusing to use it",
                meta.issuer
            );
        }
        return Ok(meta);
    }
    bail!("no authorization-server metadata was found for {issuer}")
}

fn authorization_server_candidates(issuer: &str) -> Result<Vec<String>> {
    let parsed =
        reqwest::Url::parse(issuer).with_context(|| format!("parse issuer identifier {issuer}"))?;
    let origin = parsed.origin().ascii_serialization();
    let path = parsed.path().trim_end_matches('/');
    Ok(if path.is_empty() {
        vec![
            format!("{origin}/.well-known/oauth-authorization-server"),
            format!("{origin}/.well-known/openid-configuration"),
        ]
    } else {
        vec![
            format!("{origin}/.well-known/oauth-authorization-server{path}"),
            format!("{origin}/.well-known/openid-configuration{path}"),
            format!("{origin}{path}/.well-known/openid-configuration"),
        ]
    })
}

async fn fetch_metadata(url: &str, anchor: &str, what: &str) -> Result<Option<Vec<u8>>> {
    let endpoint = checked_endpoint(url, &format!("{what} URL"), anchor).await?;
    let client = pinned_client(&endpoint, what)?;
    let resp = client
        .get(endpoint.url.clone())
        .header("Accept", "application/json")
        .send()
        .await
        .with_context(|| format!("fetch {what} at {url}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, what).await;
        bail!("{what} at {url} returned {status}, {body}");
    }
    Ok(Some(security::read_body_capped(resp, what).await?))
}

fn require_pkce_s256(meta: &AsMetadata) -> Result<()> {
    if meta
        .code_challenge_methods_supported
        .iter()
        .any(|method| method == "S256")
    {
        return Ok(());
    }
    bail!(
        "authorization server {} does not advertise PKCE S256 in code_challenge_methods_supported, refusing to authorize",
        meta.issuer
    )
}

fn canonical_resource(url: &str) -> Result<String> {
    let mut parsed =
        reqwest::Url::parse(url).with_context(|| format!("parse resource identifier {url}"))?;
    parsed.set_fragment(None);
    let rendered = parsed.to_string();
    Ok(if parsed.path() == "/" && parsed.query().is_none() {
        rendered.trim_end_matches('/').to_string()
    } else {
        rendered
    })
}

fn select_resource(server_url: &str, advertised: Option<&str>) -> Result<String> {
    let canonical = canonical_resource(server_url)?;
    let Some(advertised) = advertised else {
        return Ok(canonical);
    };
    let covering = canonical_resource(advertised)?;
    let prefix = format!("{}/", covering.trim_end_matches('/'));
    if canonical == covering || canonical.starts_with(&prefix) {
        Ok(advertised.to_string())
    } else {
        bail!(
            "protected-resource metadata names resource {advertised}, which does not cover {server_url}, refusing to use it"
        )
    }
}

fn select_scope(
    challenge: Option<&str>,
    previous: Option<&str>,
    configured: Option<&str>,
    supported: &[String],
) -> String {
    let Some(challenge) = challenge else {
        return configured
            .map(str::to_string)
            .unwrap_or_else(|| supported.join(" "));
    };
    let mut scopes: Vec<&str> = Vec::new();
    for scope in [previous, configured, Some(challenge)]
        .into_iter()
        .flatten()
        .flat_map(str::split_whitespace)
    {
        if !scopes.contains(&scope) {
            scopes.push(scope);
        }
    }
    scopes.join(" ")
}

#[derive(Debug, Serialize)]
struct RegistrationRequest<'a> {
    client_name: &'a str,
    application_type: &'a str,
    redirect_uris: Vec<&'a str>,
    grant_types: Vec<&'a str>,
    response_types: Vec<&'a str>,
    token_endpoint_auth_method: &'a str,
}

pub async fn dynamic_register(
    reg_endpoint: &str,
    redirect_uri: &str,
    server_url: &str,
    client_name: &str,
) -> Result<RegisteredClient> {
    let endpoint = checked_endpoint(reg_endpoint, "registration endpoint", server_url).await?;
    let client = pinned_client(&endpoint, "dynamic registration")?;

    let body = RegistrationRequest {
        client_name,
        application_type: "native",
        redirect_uris: vec![redirect_uri],
        grant_types: vec!["authorization_code", "refresh_token"],
        response_types: vec!["code"],
        token_endpoint_auth_method: "none",
    };

    let resp = client
        .post(endpoint.url.clone())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .with_context(|| format!("dynamic-register POST {reg_endpoint}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "dynamic registration").await;
        bail!("dynamic registration at {reg_endpoint} returned {status}, {body}");
    }

    let body = security::read_body_capped(resp, "dynamic registration").await?;
    serde_json::from_slice::<RegisteredClient>(&body)
        .with_context(|| format!("parse registration response from {reg_endpoint}"))
}

async fn prepare_loopback_callback(configured: Option<&str>) -> Result<(TcpListener, String)> {
    if let Some(uri) = configured {
        let parsed = reqwest::Url::parse(uri)
            .with_context(|| format!("invalid redirect_uri in config: {uri}"))?;
        let host = parsed.host_str().unwrap_or("");
        let is_loopback = host == "127.0.0.1" || host == "[::1]" || host == "localhost";
        if !is_loopback {
            bail!(
                "redirect_uri {uri} is not a loopback address; \
                 the agiworkforce client can only receive OAuth callbacks on 127.0.0.1 / [::1]"
            );
        }
        if let Some(port) = parsed.port() {
            let bind_host = if host == "[::1]" {
                "[::1]"
            } else {
                "127.0.0.1"
            };
            let listener = TcpListener::bind(format!("{bind_host}:{port}"))
                .await
                .with_context(|| {
                    format!("bind loopback listener at configured redirect_uri {uri}")
                })?;
            return Ok((listener, uri.to_string()));
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("bind loopback listener for OAuth callback")?;
    let local_addr = listener.local_addr().context("query loopback addr")?;
    Ok((
        listener,
        format!("http://127.0.0.1:{}{CALLBACK_PATH}", local_addr.port()),
    ))
}

async fn bind_registered(redirect_uri: &str) -> Option<TcpListener> {
    let parsed = reqwest::Url::parse(redirect_uri).ok()?;
    if parsed.host_str()? != "127.0.0.1" {
        return None;
    }
    TcpListener::bind(format!("127.0.0.1:{}", parsed.port()?))
        .await
        .ok()
}

struct ChosenClient {
    client_id: String,
    confidential: bool,
    listener: TcpListener,
    redirect_uri: String,
}

async fn choose_client(
    cfg: &OAuthConfig,
    meta: &AsMetadata,
    previous: Option<&OAuthToken>,
    hooks: &ClientHooks,
    server_url: &str,
) -> Result<ChosenClient> {
    if let Some(client_id) = cfg.client_id.as_deref() {
        if let Some(bound) = previous
            .filter(|token| token.client_id.as_deref() == Some(client_id))
            .and_then(|token| token.issuer.as_deref())
            && bound != meta.issuer
        {
            bail!(
                "the client_id configured for this MCP server was issued by {bound}, but the server \
                 now names {} as its authorization server; register a client there and update [auth.client_id]",
                meta.issuer
            );
        }
        let (listener, redirect_uri) =
            prepare_loopback_callback(cfg.redirect_uri.as_deref()).await?;
        return Ok(ChosenClient {
            client_id: client_id.to_string(),
            confidential: cfg.client_secret.is_some(),
            listener,
            redirect_uri,
        });
    }

    if meta.client_id_metadata_document_supported
        && let Some(document) = hooks.client_metadata_url.as_deref()
    {
        let (listener, redirect_uri) = prepare_loopback_callback(None).await?;
        return Ok(ChosenClient {
            client_id: document.to_string(),
            confidential: false,
            listener,
            redirect_uri,
        });
    }

    if let Some(registration) = hooks.token_store.client(&meta.issuer)
        && let Some(listener) = bind_registered(&registration.redirect_uri).await
    {
        return Ok(ChosenClient {
            client_id: registration.client_id,
            confidential: false,
            listener,
            redirect_uri: registration.redirect_uri,
        });
    }

    let Some(registration_endpoint) = meta.registration_endpoint.as_deref() else {
        bail!(
            "MCP server requires OAuth but its authorization server {} accepts neither a Client ID \
             Metadata Document from this client nor dynamic client registration, set [auth.client_id] \
             in your config",
            meta.issuer
        );
    };
    let (listener, redirect_uri) = prepare_loopback_callback(cfg.redirect_uri.as_deref()).await?;
    let registered = dynamic_register(
        registration_endpoint,
        &redirect_uri,
        server_url,
        &hooks.client_info.name,
    )
    .await?;
    let registration = ClientRegistration {
        client_id: registered.client_id,
        redirect_uri: redirect_uri.clone(),
    };
    if let Err(e) = hooks
        .token_store
        .set_client(&meta.issuer, registration.clone())
    {
        eprintln!(
            "[mcp oauth] warning: failed to persist the client registration for {}: {e}",
            meta.issuer
        );
    }
    Ok(ChosenClient {
        client_id: registration.client_id,
        confidential: false,
        listener,
        redirect_uri,
    })
}

pub struct PkceFlow<'a> {
    pub server_url: &'a str,
    pub config: &'a OAuthConfig,
    pub metadata: &'a AsMetadata,
    pub client_id: &'a str,
    pub confidential: bool,
    pub scope: &'a str,
    pub resource: &'a str,
}

pub async fn start_pkce_flow(
    flow: PkceFlow<'_>,
    listener: TcpListener,
    redirect_uri: String,
    browser: &dyn BrowserAuthorizer,
) -> Result<OAuthToken> {
    let pkce = generate_pkce();
    let state = generate_random_string(32);

    let authorize_endpoint = flow
        .config
        .authorize_url
        .as_deref()
        .unwrap_or(&flow.metadata.authorization_endpoint);
    security::validate_browser_endpoint(authorize_endpoint, flow.server_url)
        .with_context(|| format!("authorization endpoint {authorize_endpoint}"))?;

    let token_url = flow
        .config
        .token_url
        .as_deref()
        .unwrap_or(&flow.metadata.token_endpoint);
    let client_secret = if flow.confidential {
        confidential_client_secret(flow.config, token_url)?
    } else {
        None
    };

    let authorize_url = build_authorize_url(
        authorize_endpoint,
        flow.client_id,
        &redirect_uri,
        flow.scope,
        &pkce.challenge,
        &state,
        flow.resource,
    );

    if browser.open_url(&authorize_url) {
        eprintln!(
            "\n  [mcp oauth] opened browser for {} (waiting for callback)\n",
            flow.server_url
        );
    } else {
        eprintln!(
            "\n  [mcp oauth] could not open browser for {}, copy this URL manually:\n  {authorize_url}\n",
            flow.server_url
        );
    }

    let redirect_path = reqwest::Url::parse(&redirect_uri)
        .with_context(|| format!("parse redirect URI {redirect_uri}"))?
        .path()
        .to_string();
    let response = tokio::time::timeout(
        OAUTH_INTERACTIVE_TIMEOUT,
        wait_for_callback(listener, &redirect_path),
    )
    .await
    .map_err(|_| {
        anyhow!(
            "OAuth flow timed out after {}s waiting for the browser sign-in",
            OAUTH_INTERACTIVE_TIMEOUT.as_secs()
        )
    })??;
    let code = accept_authorization_response(
        response,
        &state,
        &flow.metadata.issuer,
        flow.metadata.authorization_response_iss_parameter_supported,
    )?;

    let token_resp = exchange_code_form(
        token_url,
        flow.client_id,
        client_secret,
        &code,
        &pkce.verifier,
        &redirect_uri,
        flow.resource,
        flow.server_url,
    )
    .await?;

    Ok(token_response_to_record(
        token_resp,
        GrantContext {
            token_url,
            client_id: flow.client_id,
            requested_scope: Some(flow.scope).filter(|scope| !scope.is_empty()),
            issuer: Some(&flow.metadata.issuer),
            resource: Some(flow.resource),
        },
    ))
}

pub async fn refresh_token(
    token: &OAuthToken,
    oauth_cfg: &OAuthConfig,
    server_url: &str,
) -> Result<OAuthToken> {
    let refresh = token
        .refresh_token
        .as_deref()
        .ok_or_else(|| anyhow!("no refresh_token cached for this server"))?;

    let token_url = token
        .token_url
        .as_deref()
        .or(oauth_cfg.token_url.as_deref())
        .ok_or_else(|| anyhow!("no token_url cached and none in config"))?;

    let client_id = token
        .client_id
        .as_deref()
        .or(oauth_cfg.client_id.as_deref())
        .ok_or_else(|| anyhow!("no client_id cached and none in config"))?;

    if let Some(configured) = oauth_cfg.token_url.as_deref() {
        security::enforce_same_origin(configured, token_url, "token endpoint")
            .context("refusing to send the cached refresh token to another origin")?;
    }
    let client_secret = confidential_client_secret(oauth_cfg, token_url)?;

    let anchor = token
        .auth_server_metadata_url
        .as_deref()
        .unwrap_or_default();
    let endpoint = checked_endpoint(token_url, "token endpoint", anchor).await?;
    let client = pinned_client(&endpoint, "refresh")?;
    let resource = match token.resource.clone() {
        Some(resource) => resource,
        None => canonical_resource(server_url)?,
    };

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", client_id),
        ("resource", &resource),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(endpoint.url.clone())
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("refresh POST {token_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "token refresh").await;
        bail!("token refresh at {token_url} returned {status}, {body}");
    }

    let body = security::read_body_capped(resp, "token refresh").await?;
    let parsed: TokenResponseRaw = serde_json::from_slice(&body)
        .with_context(|| format!("parse refresh response from {token_url}"))?;

    let mut refreshed = token_response_to_record(
        parsed,
        GrantContext {
            token_url,
            client_id,
            requested_scope: token.scope.as_deref(),
            issuer: token.issuer.as_deref(),
            resource: Some(&resource),
        },
    );
    if refreshed.refresh_token.is_none() {
        refreshed.refresh_token = Some(refresh.to_string());
    }
    refreshed.auth_server_metadata_url = token.auth_server_metadata_url.clone();
    Ok(refreshed)
}

fn revocation_endpoint_allowed(issuer: &str, endpoint: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(endpoint) else {
        return false;
    };
    parsed.scheme() == "https"
        && security::enforce_same_origin(issuer, endpoint, "revocation endpoint").is_ok()
}

pub async fn revoke_token(
    token: &OAuthToken,
    oauth_cfg: &OAuthConfig,
    server_url: &str,
) -> Result<bool> {
    let issuer = match token.issuer.clone() {
        Some(issuer) => issuer,
        None => {
            let (_, prm) = discover_protected_resource(server_url, None).await?;
            prm.authorization_servers
                .first()
                .cloned()
                .ok_or_else(|| anyhow!("no authorization_servers in protected-resource metadata"))?
        }
    };
    let metadata = discover_authorization_server(&issuer, server_url).await?;
    let Some(revocation_url) = metadata.revocation_endpoint.as_deref() else {
        return Ok(false);
    };
    if !revocation_endpoint_allowed(&issuer, revocation_url) {
        bail!(
            "the advertised revocation endpoint is not an https address on the authorization server's own origin, so the token was not sent there"
        );
    }
    let client_id = token
        .client_id
        .as_deref()
        .or(oauth_cfg.client_id.as_deref())
        .ok_or_else(|| anyhow!("no client_id cached and none in config"))?;
    let client_secret = confidential_client_secret(oauth_cfg, revocation_url)?;
    let anchor = token
        .auth_server_metadata_url
        .as_deref()
        .unwrap_or(issuer.as_str());
    let endpoint = checked_endpoint(revocation_url, "revocation endpoint", anchor).await?;
    let client = pinned_client(&endpoint, "revocation")?;

    let mut credentials: Vec<(&str, &str)> = Vec::new();
    if let Some(refresh) = token.refresh_token.as_deref() {
        credentials.push((refresh, "refresh_token"));
    }
    credentials.push((token.access_token.as_str(), "access_token"));

    let mut revoked = false;
    for (value, hint) in credentials {
        let mut form: Vec<(&str, &str)> = vec![
            ("token", value),
            ("token_type_hint", hint),
            ("client_id", client_id),
        ];
        if let Some(secret) = client_secret {
            form.push(("client_secret", secret));
        }
        let resp = client
            .post(endpoint.url.clone())
            .header("Accept", "application/json")
            .form(&form)
            .send()
            .await
            .with_context(|| format!("revocation POST {revocation_url}"))?;
        if resp.status().is_success() {
            revoked = true;
        } else {
            let status = resp.status();
            let body = failure_detail(resp, "token revocation").await;
            bail!("token revocation at {revocation_url} returned {status}, {body}");
        }
    }
    Ok(revoked)
}

#[derive(Debug, Deserialize)]
struct TokenResponseRaw {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
    #[serde(default)]
    scope: Option<String>,
}

struct GrantContext<'a> {
    token_url: &'a str,
    client_id: &'a str,
    requested_scope: Option<&'a str>,
    issuer: Option<&'a str>,
    resource: Option<&'a str>,
}

fn token_response_to_record(raw: TokenResponseRaw, grant: GrantContext<'_>) -> OAuthToken {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    OAuthToken {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token,
        token_type: raw.token_type.or_else(|| Some("Bearer".to_string())),
        expires_at: raw.expires_in.map(|e| now.saturating_add(e)),
        scope: raw
            .scope
            .or_else(|| grant.requested_scope.map(str::to_string)),
        auth_server_metadata_url: None,
        token_url: Some(grant.token_url.to_string()),
        client_id: Some(grant.client_id.to_string()),
        issuer: grant.issuer.map(str::to_string),
        resource: grant.resource.map(str::to_string),
    }
}

#[allow(clippy::too_many_arguments)]
async fn exchange_code_form(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
    resource: &str,
    server_url: &str,
) -> Result<TokenResponseRaw> {
    let endpoint = checked_endpoint(token_url, "token endpoint", server_url).await?;
    let client = pinned_client(&endpoint, "code exchange")?;

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
        ("resource", resource),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(endpoint.url.clone())
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("exchange POST {token_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "code exchange").await;
        bail!("code exchange at {token_url} returned {status}, {body}");
    }

    let body = security::read_body_capped(resp, "code exchange").await?;
    serde_json::from_slice::<TokenResponseRaw>(&body)
        .with_context(|| format!("parse code-exchange response from {token_url}"))
}

#[derive(Debug, Default)]
struct AuthorizationResponse {
    code: Option<String>,
    state: Option<String>,
    iss: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

async fn wait_for_callback(
    listener: TcpListener,
    redirect_path: &str,
) -> Result<AuthorizationResponse> {
    loop {
        let (mut stream, _peer) = listener
            .accept()
            .await
            .context("accept loopback OAuth callback")?;
        let Ok(Ok(request_line)) =
            tokio::time::timeout(CALLBACK_READ_TIMEOUT, read_request_head(&mut stream)).await
        else {
            continue;
        };
        if !is_redirect_request(&request_line, redirect_path) {
            let _ = stream
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await;
            let _ = stream.shutdown().await;
            continue;
        }

        let body = "<!doctype html><html><body style=\"font-family:system-ui;text-align:center;padding:3rem;\">\
                    <h1>Authorization complete</h1>\
                    <p>You can close this tab and return to your terminal.</p>\
                    </body></html>";
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
             Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes()).await;
        let _ = stream.shutdown().await;

        return parse_authorization_response(&request_line);
    }
}

async fn read_request_head(stream: &mut TcpStream) -> Result<String> {
    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .await
        .context("read OAuth callback request line")?;

    let mut header_line = String::new();
    loop {
        header_line.clear();
        let n = reader
            .read_line(&mut header_line)
            .await
            .context("read OAuth callback headers")?;
        if n == 0 || header_line == "\r\n" || header_line == "\n" {
            break;
        }
    }
    Ok(request_line)
}

fn is_redirect_request(request_line: &str, redirect_path: &str) -> bool {
    let mut parts = request_line.split_whitespace();
    parts.next() == Some("GET")
        && parts
            .next()
            .is_some_and(|target| target.split('?').next() == Some(redirect_path))
}

fn parse_authorization_response(request_line: &str) -> Result<AuthorizationResponse> {
    let mut parts = request_line.split_whitespace();
    let _method = parts
        .next()
        .ok_or_else(|| anyhow!("malformed callback request line"))?;
    let path = parts
        .next()
        .ok_or_else(|| anyhow!("missing path in callback request"))?;
    let qs_start = path
        .find('?')
        .ok_or_else(|| anyhow!("no query string on callback request"))?;

    let mut response = AuthorizationResponse::default();
    for pair in path[qs_start + 1..].split('&') {
        let Some((k, v)) = pair.split_once('=') else {
            continue;
        };
        let decoded = percent_decode(v);
        match k {
            "code" => response.code = Some(decoded),
            "state" => response.state = Some(decoded),
            "iss" => response.iss = Some(decoded),
            "error" => response.error = Some(decoded),
            "error_description" => response.error_description = Some(decoded),
            _ => {}
        }
    }
    Ok(response)
}

fn accept_authorization_response(
    response: AuthorizationResponse,
    expected_state: &str,
    issuer: &str,
    iss_required: bool,
) -> Result<String> {
    if response.state.as_deref() != Some(expected_state) {
        bail!("oauth state mismatch, possible CSRF, refusing to continue");
    }
    match response.iss.as_deref() {
        Some(iss) if iss != issuer => bail!(
            "the authorization response names issuer {iss}, not {issuer}, refusing to continue (RFC 9207)"
        ),
        None if iss_required => bail!(
            "authorization server {issuer} promises an iss parameter but the response carried none, refusing to continue (RFC 9207)"
        ),
        _ => {}
    }
    if let Some(error) = response.error {
        bail!(
            "authorization server returned error: {error}{}",
            response
                .error_description
                .map(|d| format!(", {d}"))
                .unwrap_or_default()
        );
    }
    response
        .code
        .ok_or_else(|| anyhow!("OAuth callback missing `code` param"))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        if b == b'+' {
            out.push(b' ');
        } else {
            out.push(b);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn build_authorize_url(
    authorize_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    code_challenge: &str,
    state: &str,
    resource: &str,
) -> String {
    let sep = if authorize_endpoint.contains('?') {
        '&'
    } else {
        '?'
    };
    let mut out = format!(
        "{authorize_endpoint}{sep}response_type=code&client_id={cid}&redirect_uri={ru}&\
         code_challenge={chal}&code_challenge_method=S256&state={st}&resource={res}",
        cid = url_encode(client_id),
        ru = url_encode(redirect_uri),
        chal = url_encode(code_challenge),
        st = url_encode(state),
        res = url_encode(resource),
    );
    if !scope.is_empty() {
        out.push_str(&format!("&scope={}", url_encode(scope)));
    }
    out
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub async fn discover_token_endpoint(server_url: &str) -> Result<String> {
    let (_, prm) = discover_protected_resource(server_url, None).await?;
    let issuer = prm
        .authorization_servers
        .first()
        .ok_or_else(|| anyhow!("no authorization_servers in protected-resource metadata"))?;
    Ok(discover_authorization_server(issuer, server_url)
        .await?
        .token_endpoint)
}

pub async fn perform_full_oauth(
    server_url: &str,
    cfg: &OAuthConfig,
    www_authenticate: Option<&str>,
    hooks: &ClientHooks,
) -> Result<OAuthToken> {
    let (metadata_url, prm) = discover_protected_resource(server_url, www_authenticate).await?;
    let resource = select_resource(server_url, prm.resource.as_deref())?;
    let issuer = prm
        .authorization_servers
        .first()
        .ok_or_else(|| anyhow!("no authorization_servers in protected-resource metadata"))?;
    let metadata = discover_authorization_server(issuer, server_url).await?;
    require_pkce_s256(&metadata)?;

    let previous = hooks.token_store.get(server_url);
    let scope = select_scope(
        challenge_scope(www_authenticate).as_deref(),
        previous.as_ref().and_then(|token| token.scope.as_deref()),
        cfg.scope.as_deref(),
        &prm.scopes_supported,
    );
    let client = choose_client(cfg, &metadata, previous.as_ref(), hooks, server_url).await?;

    let mut token = start_pkce_flow(
        PkceFlow {
            server_url,
            config: cfg,
            metadata: &metadata,
            client_id: &client.client_id,
            confidential: client.confidential,
            scope: &scope,
            resource: &resource,
        },
        client.listener,
        client.redirect_uri,
        hooks.browser.as_ref(),
    )
    .await?;
    token.auth_server_metadata_url = Some(metadata_url);
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_resource_metadata_from_www_authenticate() {
        let h = r#"Bearer realm="mcp", resource_metadata="https://example.com/.well-known/oauth-protected-resource""#;
        assert_eq!(
            parse_resource_metadata_url(Some(h)).as_deref(),
            Some("https://example.com/.well-known/oauth-protected-resource")
        );
    }

    #[test]
    fn no_resource_metadata_when_header_missing() {
        assert!(parse_resource_metadata_url(None).is_none());
        assert!(parse_resource_metadata_url(Some("Bearer realm=\"x\"")).is_none());
    }

    #[test]
    fn detects_insufficient_scope() {
        let h = r#"Bearer error="insufficient_scope", scope="messages:write""#;
        assert_eq!(
            parse_insufficient_scope(Some(h)).as_deref(),
            Some("messages:write")
        );
    }

    #[test]
    fn ignores_other_errors() {
        let h = r#"Bearer error="invalid_token""#;
        assert!(parse_insufficient_scope(Some(h)).is_none());
    }

    #[tokio::test]
    async fn prepare_loopback_callback_default_uses_random_port() {
        let (listener, uri) = super::prepare_loopback_callback(None)
            .await
            .expect("default loopback bind should succeed");
        let bound_port = listener.local_addr().unwrap().port();
        let parsed = reqwest::Url::parse(&uri).expect("returned uri must parse");
        assert_eq!(parsed.host_str(), Some("127.0.0.1"));
        assert_eq!(parsed.port(), Some(bound_port));
        assert_eq!(parsed.path(), "/callback");
    }

    #[tokio::test]
    async fn prepare_loopback_callback_honours_explicit_loopback_port() {
        let scratch = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let chosen_port = scratch.local_addr().unwrap().port();
        drop(scratch);

        let configured = format!("http://127.0.0.1:{chosen_port}/callback");
        let (listener, uri) = super::prepare_loopback_callback(Some(&configured))
            .await
            .expect("explicit loopback bind should succeed");
        assert_eq!(uri, configured, "uri must round-trip the configured value");
        assert_eq!(listener.local_addr().unwrap().port(), chosen_port);
    }

    #[tokio::test]
    async fn prepare_loopback_callback_rejects_non_loopback() {
        let err = super::prepare_loopback_callback(Some("https://example.com/oauth/callback"))
            .await
            .expect_err("non-loopback redirect_uri must error");
        assert!(
            err.to_string().contains("not a loopback address"),
            "expected loopback rejection, got: {err}"
        );
    }

    #[tokio::test]
    async fn prepare_loopback_callback_rebinds_portless_placeholder() {
        let (listener, uri) = super::prepare_loopback_callback(Some("http://127.0.0.1/callback"))
            .await
            .expect("portless placeholder should fall through to random bind");
        let bound_port = listener.local_addr().unwrap().port();
        assert!(
            uri.contains(&format!(":{bound_port}/callback")),
            "returned URI {uri} should include real bound port {bound_port}"
        );
        assert_ne!(uri, "http://127.0.0.1/callback");
    }

    #[test]
    fn well_known_root_strip() {
        assert_eq!(
            protected_resource_candidates("https://mcp.example.com/some/path/").unwrap(),
            vec![
                "https://mcp.example.com/.well-known/oauth-protected-resource/some/path",
                "https://mcp.example.com/.well-known/oauth-protected-resource",
            ]
        );
        assert_eq!(
            authorization_server_candidates("https://mcp.example.com").unwrap()[0],
            "https://mcp.example.com/.well-known/oauth-authorization-server"
        );
    }

    #[test]
    fn parses_callback_query() {
        let line = "GET /callback?code=ABC&state=XYZ HTTP/1.1\r\n";
        let response = parse_authorization_response(line).unwrap();
        assert_eq!(response.code.as_deref(), Some("ABC"));
        assert_eq!(response.state.as_deref(), Some("XYZ"));
    }

    #[test]
    fn percent_decodes_plus_and_hex() {
        assert_eq!(percent_decode("a%20b+c"), "a b c");
        assert_eq!(percent_decode("hello%21"), "hello!");
    }

    #[test]
    fn callback_surfaces_authorization_errors() {
        let line = "GET /callback?error=access_denied&error_description=user%20declined&state=XYZ HTTP/1.1\r\n";
        let response = parse_authorization_response(line).unwrap();
        let err = accept_authorization_response(response, "XYZ", "https://as.example.com", false)
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("access_denied"));
        assert!(msg.contains("user declined"));
    }

    #[test]
    fn build_authorize_url_with_query_existing() {
        let u = build_authorize_url(
            "https://example.com/auth?foo=bar",
            "cid",
            "http://127.0.0.1:1234/callback",
            "read write",
            "challenge",
            "state123",
            "https://mcp.example.com/mcp",
        );
        assert!(u.contains("foo=bar&response_type=code"));
        assert!(u.contains("scope=read%20write"));
        assert!(u.contains("code_challenge_method=S256"));
    }

    const REMOTE_SERVER: &str = "https://mcp.example.com/mcp";

    fn token_from(server_url: &str, token_url: &str) -> OAuthToken {
        OAuthToken {
            access_token: "stale-access".into(),
            refresh_token: Some("real-refresh-token".into()),
            token_type: Some("Bearer".into()),
            expires_at: None,
            scope: None,
            auth_server_metadata_url: protected_resource_candidates(server_url)
                .ok()
                .and_then(|candidates| candidates.last().cloned()),
            token_url: Some(token_url.into()),
            client_id: Some("cid".into()),
            issuer: None,
            resource: None,
        }
    }

    fn token_with(token_url: &str) -> OAuthToken {
        token_from(REMOTE_SERVER, token_url)
    }

    #[test]
    fn revocation_goes_only_to_the_issuers_own_https_origin() {
        let issuer = "https://as.example.com";
        assert!(revocation_endpoint_allowed(
            issuer,
            "https://as.example.com/revoke"
        ));
        assert!(!revocation_endpoint_allowed(
            issuer,
            "http://as.example.com/revoke"
        ));
        assert!(!revocation_endpoint_allowed(
            issuer,
            "https://collector.evil.test/revoke"
        ));
        assert!(!revocation_endpoint_allowed(issuer, "not a url"));
    }

    fn as_meta_with(authorization_endpoint: &str, token_endpoint: &str) -> AsMetadata {
        AsMetadata {
            issuer: "https://as.example.com".into(),
            authorization_endpoint: authorization_endpoint.into(),
            token_endpoint: token_endpoint.into(),
            registration_endpoint: None,
            revocation_endpoint: None,
            code_challenge_methods_supported: vec!["S256".into()],
            client_id_metadata_document_supported: false,
            authorization_response_iss_parameter_supported: false,
        }
    }

    #[derive(Default)]
    struct SpyBrowser {
        opened: std::sync::Mutex<Vec<String>>,
    }

    impl BrowserAuthorizer for SpyBrowser {
        fn is_interactive(&self) -> bool {
            true
        }
        fn open_url(&self, url: &str) -> bool {
            self.opened.lock().unwrap().push(url.to_string());
            true
        }
    }

    async fn pkce_refusal(oauth_cfg: OAuthConfig, as_meta: AsMetadata) -> (String, usize) {
        let spy = SpyBrowser::default();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let err = start_pkce_flow(
            PkceFlow {
                server_url: REMOTE_SERVER,
                config: &oauth_cfg,
                metadata: &as_meta,
                client_id: "cid",
                confidential: oauth_cfg.client_secret.is_some(),
                scope: "",
                resource: REMOTE_SERVER,
            },
            listener,
            "http://127.0.0.1:1234/callback".to_string(),
            &spy,
        )
        .await
        .expect_err("the flow must refuse before any browser opens");
        let opened = spy.opened.lock().unwrap().len();
        (format!("{err:#}"), opened)
    }

    async fn spawn(app: axum::Router) -> std::net::SocketAddr {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        addr
    }

    #[tokio::test]
    async fn discovery_refuses_a_metadata_url_the_challenge_puts_on_another_origin() {
        for target in [
            "http://127.0.0.1:9200/_cat/indices?v",
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "https://exfil.example.net/collect",
        ] {
            let header = format!(r#"Bearer realm="mcp", resource_metadata="{target}""#);
            let err = discover_protected_resource(REMOTE_SERVER, Some(&header))
                .await
                .expect_err("a challenge may only name the server's own metadata");
            let msg = format!("{err:#}");
            assert!(msg.contains("SSRF protection"), "{target}: {msg}");
            assert!(msg.contains("another origin"), "{target}: {msg}");
        }
    }

    #[tokio::test]
    async fn discovery_refuses_a_cleartext_remote_server() {
        let err = discover_protected_resource("http://mcp.example.com/mcp", None)
            .await
            .expect_err("cleartext remote discovery must be refused");
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[tokio::test]
    async fn discovery_refuses_a_loopback_authorization_server_named_by_a_remote_server() {
        let err = discover_authorization_server("http://127.0.0.1:9200/", REMOTE_SERVER)
            .await
            .expect_err("a public MCP server must not point discovery at this machine");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
        assert!(msg.contains("loopback"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn discovery_honours_a_same_origin_challenge_url() {
        let app = axum::Router::new().route(
            "/oauth/resource",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "authorization_servers": ["http://127.0.0.1"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let header = format!(r#"Bearer resource_metadata="http://{addr}/oauth/resource""#);
        let (url, prm) = discover_protected_resource(&format!("http://{addr}/mcp"), Some(&header))
            .await
            .expect("a same-origin challenge URL is the RFC 9728 happy path");
        assert_eq!(url, format!("http://{addr}/oauth/resource"));
        assert_eq!(prm.authorization_servers, vec!["http://127.0.0.1"]);
    }

    #[tokio::test]
    async fn discovery_still_works_against_a_loopback_server() {
        let app = axum::Router::new().route(
            "/.well-known/oauth-protected-resource",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "resource": "http://127.0.0.1/",
                    "authorization_servers": ["http://127.0.0.1"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let (url, prm) = discover_protected_resource(&format!("http://{addr}/"), None)
            .await
            .expect("loopback discovery must keep working");
        assert!(url.ends_with("/.well-known/oauth-protected-resource"));
        assert_eq!(prm.authorization_servers, vec!["http://127.0.0.1"]);
    }

    #[tokio::test]
    async fn discovery_refuses_an_oversized_metadata_body() {
        let app = axum::Router::new().route(
            "/.well-known/oauth-protected-resource",
            axum::routing::get(|| async {
                let filler = "a".repeat(crate::security::MAX_METADATA_BODY_BYTES + 1024);
                axum::Json(serde_json::json!({
                    "resource": filler,
                    "authorization_servers": ["https://as.example.com"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let err = discover_protected_resource(&format!("http://{addr}/"), None)
            .await
            .expect_err("an oversized metadata body must not be buffered");
        assert!(format!("{err:#}").contains("exceeds"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_private_token_url() {
        let token = token_with("http://10.0.0.5/token");
        let err = refresh_token(&token, &OAuthConfig::default(), REMOTE_SERVER)
            .await
            .expect_err("a private-network token endpoint must not receive the refresh token");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn refresh_refuses_a_cleartext_remote_token_url() {
        let token = token_with("http://as.example.com/token");
        let err = refresh_token(&token, &OAuthConfig::default(), REMOTE_SERVER)
            .await
            .expect_err("credentials must not cross the network in cleartext");
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_cached_token_url_from_another_origin() {
        let token = token_with("https://evil.example.com/token");
        let cfg = OAuthConfig {
            token_url: Some("https://as.example.com/token".into()),
            client_secret: Some("s3cret".into()),
            ..Default::default()
        };
        let err = refresh_token(&token, &cfg, REMOTE_SERVER)
            .await
            .expect_err("a poisoned cached token endpoint must not override the configured one");
        assert!(format!("{err:#}").contains("does not match the pinned origin"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_loopback_token_url_when_the_server_is_remote() {
        let token = token_with("http://127.0.0.1:9200/token");
        let err = refresh_token(&token, &OAuthConfig::default(), REMOTE_SERVER)
            .await
            .expect_err("a remote server's token must never be refreshed against this machine");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
        assert!(msg.contains("loopback"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn refresh_keeps_a_configured_secret_from_a_discovered_endpoint() {
        let token = token_with("https://as.example.com/token");
        let cfg = OAuthConfig {
            client_secret: Some("configured-secret".into()),
            ..Default::default()
        };
        let err = refresh_token(&token, &cfg, REMOTE_SERVER)
            .await
            .expect_err("a user-held secret must not go to a discovered endpoint");
        assert!(format!("{err:#}").contains("set [auth.token_url]"));
    }

    #[tokio::test]
    async fn refresh_against_loopback_keeps_the_cached_discovery_url() {
        let app = axum::Router::new().route(
            "/token",
            axum::routing::post(|| async {
                axum::Json(serde_json::json!({
                    "access_token": "fresh-access",
                    "token_type": "Bearer",
                    "expires_in": 3600
                }))
            }),
        );
        let addr = spawn(app).await;
        let local_server = format!("http://{addr}/mcp");
        let token = token_from(&local_server, &format!("http://{addr}/token"));
        let refreshed = refresh_token(&token, &OAuthConfig::default(), &local_server)
            .await
            .expect("loopback refresh must keep working");
        assert_eq!(refreshed.access_token, "fresh-access");
        assert_eq!(
            refreshed.auth_server_metadata_url,
            token.auth_server_metadata_url
        );
    }

    #[tokio::test]
    async fn authorize_endpoints_that_leave_the_web_never_reach_the_browser() {
        for endpoint in ["javascript:alert(1)", "file:///etc/passwd"] {
            let (msg, opened) = pkce_refusal(
                OAuthConfig::default(),
                as_meta_with(endpoint, "https://as.example.com/token"),
            )
            .await;
            assert!(msg.contains("is not allowed"), "{endpoint}: {msg}");
            assert_eq!(opened, 0, "{endpoint} must never be opened");
        }
    }

    #[tokio::test]
    async fn authorize_endpoint_on_this_machine_never_reaches_the_browser() {
        let (msg, opened) = pkce_refusal(
            OAuthConfig::default(),
            as_meta_with(
                "http://127.0.0.1:9200/authorize",
                "https://as.example.com/token",
            ),
        )
        .await;
        assert!(msg.contains("names this machine"), "{msg}");
        assert_eq!(opened, 0);
    }

    #[tokio::test]
    async fn a_configured_secret_stops_the_flow_before_the_browser_opens() {
        let cfg = OAuthConfig {
            client_secret: Some("configured-secret".into()),
            ..Default::default()
        };
        let (msg, opened) = pkce_refusal(
            cfg,
            as_meta_with(
                "https://as.example.com/authorize",
                "https://as.example.com/token",
            ),
        )
        .await;
        assert!(msg.contains("set [auth.token_url]"), "{msg}");
        assert_eq!(opened, 0);
    }

    #[test]
    fn failure_detail_only_echoes_structured_oauth_errors() {
        assert_eq!(
            oauth_error_detail(br#"{"error":"invalid_grant","error_description":"expired"}"#)
                .as_deref(),
            Some("invalid_grant: expired")
        );
        assert!(oauth_error_detail(b"green master 1 0 42 0 12.5kb").is_none());
        assert!(oauth_error_detail(br#"{"error":{"reason":"index_not_found"}}"#).is_none());
        assert!(oauth_error_detail(br#"{"took":3,"hits":{"total":9}}"#).is_none());
    }

    #[test]
    fn build_authorize_url_without_query() {
        let u = build_authorize_url(
            "https://example.com/auth",
            "cid",
            "http://127.0.0.1:1234/callback",
            "",
            "challenge",
            "state123",
            "https://mcp.example.com/mcp",
        );
        assert!(u.starts_with("https://example.com/auth?response_type=code"));
        assert!(!u.contains("scope="));
    }
}
