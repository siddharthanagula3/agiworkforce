use once_cell::sync::OnceCell;
use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

use crate::sys::api::{
    ApiClient, ApiRequest, ApiResponse, HttpMethod, OAuth2Client, OAuth2Config, PkceChallenge,
    RequestTemplate, ResponseParser, TokenResponse,
};
use crate::sys::security::egress_policy::{judge_destination, HostResolver, SystemResolver};

pub struct ApiState {
    client: OnceCell<ApiClient>,
    public_client: OnceCell<ApiClient>,
    single_attempt_client: OnceCell<ApiClient>,
    oauth_clients: Mutex<HashMap<String, OAuth2Client>>,
    pkce_challenges: Mutex<HashMap<String, PkceChallenge>>,
}

impl Default for ApiState {
    fn default() -> Self {
        Self {
            client: OnceCell::new(),
            public_client: OnceCell::new(),
            single_attempt_client: OnceCell::new(),
            oauth_clients: Mutex::new(HashMap::new()),
            pkce_challenges: Mutex::new(HashMap::new()),
        }
    }
}

impl ApiState {
    pub fn new() -> Result<Self, String> {
        let state = Self::default();
        // Eagerly initialize the client to catch errors early
        state.get_client()?;
        Ok(state)
    }

    /// Get or lazily initialize the API client
    pub fn get_client(&self) -> Result<&ApiClient, String> {
        self.client.get_or_try_init(|| {
            ApiClient::new().map_err(|e| format!("Failed to initialize API client: {}", e))
        })
    }

    /// Get the client whose initial destination and every redirect hop must be
    /// public. User- and LLM-selected API destinations must use this client.
    pub fn get_public_client(&self) -> Result<&ApiClient, String> {
        self.public_client.get_or_try_init(|| {
            ApiClient::public()
                .map_err(|e| format!("Failed to initialize public API client: {}", e))
        })
    }

    /// Return the shared client for non-idempotent requests that must never be
    /// replayed by either reqwest or the generic transient-retry middleware.
    pub fn get_single_attempt_client(&self) -> Result<&ApiClient, String> {
        self.single_attempt_client.get_or_try_init(|| {
            ApiClient::single_attempt()
                .map_err(|e| format!("Failed to initialize single-attempt API client: {}", e))
        })
    }

    pub async fn execute_request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        self.get_client()?
            .execute(request)
            .await
            .map_err(|e| format!("API request failed: {}", e))
    }

    /// Execute a request whose URL was chosen by the WebView.
    ///
    /// The WebView's CSP `connect-src` allowlist only governs `fetch`/`XHR`
    /// issued by renderer JavaScript. `invoke()`-ing one of the `api_*` commands
    /// moves the request into the Rust process, where that allowlist has no
    /// effect, so the destination is judged here against the same
    /// `egress_policy` the tool guard applies to LLM-supplied URLs. Every
    /// renderer-facing `api_*` command routes through this method, the
    /// unchecked [`Self::execute_request`] is for URLs the app builds itself
    /// from an already-validated base (account, credits, OAuth), which are
    /// allowed to reach a `localhost` API server in development.
    pub async fn execute_renderer_request(
        &self,
        request: ApiRequest,
    ) -> Result<ApiResponse, String> {
        self.get_public_client()?
            .execute(request)
            .await
            .map_err(|e| format!("Public API request failed: {}", e))
    }

    /// Execute an agent-selected request through the same public-only boundary
    /// as renderer-selected API calls.
    pub async fn execute_public_request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        self.execute_renderer_request(request).await
    }
}

/// Judge the two endpoints of a renderer-supplied OAuth 2.0 client.
///
/// `token_url` is where `api_oauth_exchange_code` / `api_oauth_refresh_token` /
/// `api_oauth_client_credentials` later POST the client secret, and `auth_url`
/// is where the user is sent to authenticate, both are chosen by the renderer,
/// so both go through the same egress policy as any other renderer-supplied
/// destination, before the client is stored. `redirect_uri` is deliberately not
/// judged: it is the loopback callback the browser returns to, not a
/// destination this process connects out to.
fn ensure_oauth_endpoints_public(config: &OAuth2Config) -> Result<(), String> {
    ensure_oauth_endpoints_public_with(config, &SystemResolver)
}

/// [`ensure_oauth_endpoints_public`] with the name resolver injected, so the
/// policy decision can be tested without depending on what DNS answers.
fn ensure_oauth_endpoints_public_with(
    config: &OAuth2Config,
    resolver: &dyn HostResolver,
) -> Result<(), String> {
    for (field, value) in [
        ("authUrl", config.auth_url.as_str()),
        ("tokenUrl", config.token_url.as_str()),
    ] {
        let scheme = url::Url::parse(value)
            .map_err(|_| format!("{field}: not a valid URL"))?
            .scheme()
            .to_ascii_lowercase();
        if scheme != "https" {
            return Err(format!(
                "{field}: must use https, got {scheme}. The token call POSTs client_secret in a \
                 form body and the authorization code rides the same exchange."
            ));
        }
        judge_destination(value, resolver).map_err(|denial| format!("{field}: {denial}"))?;
    }
    Ok(())
}

/// Build the request a JSON-bodied shorthand command sends.
fn json_body_request(method: HttpMethod, url: String, body: String) -> ApiRequest {
    ApiRequest {
        method,
        url,
        body: Some(body),
        headers: HashMap::from([("Content-Type".to_string(), "application/json".to_string())]),
        ..Default::default()
    }
}

#[tauri::command]
pub async fn api_request(
    request: ApiRequest,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!(
        "Executing API request: {} {}",
        request.method.to_string(),
        request.url
    );

    state.execute_renderer_request(request).await
}

#[tauri::command]
pub async fn api_get(url: String, state: State<'_, ApiState>) -> Result<ApiResponse, String> {
    tracing::info!("Executing GET request to {}", url);

    state
        .execute_renderer_request(ApiRequest {
            method: HttpMethod::Get,
            url,
            ..Default::default()
        })
        .await
}

#[tauri::command]
pub async fn api_post_json(
    url: String,
    body: String,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!("Executing POST request to {}", url);

    state
        .execute_renderer_request(json_body_request(HttpMethod::Post, url, body))
        .await
}

#[tauri::command]
pub async fn api_put_json(
    url: String,
    body: String,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!("Executing PUT request to {}", url);

    state
        .execute_renderer_request(json_body_request(HttpMethod::Put, url, body))
        .await
}

#[tauri::command]
pub async fn api_delete(url: String, state: State<'_, ApiState>) -> Result<ApiResponse, String> {
    tracing::info!("Executing DELETE request to {}", url);

    state
        .execute_renderer_request(ApiRequest {
            method: HttpMethod::Delete,
            url,
            ..Default::default()
        })
        .await
}

#[tauri::command]
pub async fn api_parse_response(
    body: String,
    content_type: Option<String>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Parsing API response");

    let parsed = ResponseParser::parse(&body, content_type.as_deref())
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(serde_json::json!({
        "format": parsed.format,
        "data": parsed.data,
        "raw": parsed.raw,
    }))
}

#[tauri::command]
pub async fn api_extract_json_path(
    body: String,
    path: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Extracting JSON path: {}", path);

    let parsed = ResponseParser::parse(&body, Some("application/json"))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    ResponseParser::extract_json_path(&parsed, &path)
        .map_err(|e| format!("Failed to extract path: {}", e))
}

#[tauri::command]
pub async fn api_oauth_create_client(
    client_id: String,
    config: OAuth2Config,
    state: State<'_, ApiState>,
) -> Result<(), String> {
    tracing::info!("Creating OAuth 2.0 client: {}", client_id);

    ensure_oauth_endpoints_public(&config)?;

    let oauth_client =
        OAuth2Client::new(config).map_err(|e| format!("Failed to create OAuth client: {}", e))?;
    let mut clients = state.oauth_clients.lock().await;
    clients.insert(client_id, oauth_client);

    Ok(())
}

#[tauri::command]
pub async fn api_oauth_get_auth_url(
    client_id: String,
    state_param: String,
    use_pkce: bool,
    state: State<'_, ApiState>,
) -> Result<String, String> {
    tracing::info!("Getting OAuth authorization URL for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    let pkce = if use_pkce {
        let challenge = PkceChallenge::generate();
        let auth_url = oauth_client.get_authorization_url(&state_param, Some(&challenge));

        let mut challenges = state.pkce_challenges.lock().await;
        challenges.insert(client_id.clone(), challenge);

        auth_url
    } else {
        oauth_client.get_authorization_url(&state_param, None)
    };

    Ok(pkce)
}

#[tauri::command]
pub async fn api_oauth_exchange_code(
    client_id: String,
    code: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Exchanging authorization code for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    let code_verifier = {
        let mut challenges = state.pkce_challenges.lock().await;
        challenges.remove(&client_id).map(|c| c.code_verifier)
    };

    oauth_client
        .exchange_code(&code, code_verifier.as_deref())
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))
}

#[tauri::command]
pub async fn api_oauth_refresh_token(
    client_id: String,
    refresh_token: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Refreshing access token for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    oauth_client
        .refresh_token(&refresh_token)
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))
}

#[tauri::command]
pub async fn api_oauth_client_credentials(
    client_id: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Getting token via client credentials for: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    oauth_client
        .client_credentials()
        .await
        .map_err(|e| format!("Client credentials flow failed: {}", e))
}

#[tauri::command]
pub async fn api_render_template(
    template: RequestTemplate,
    variables: HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Rendering request template: {}", template.name);

    let rendered = template
        .render(&variables)
        .map_err(|e| format!("Failed to render template: {}", e))?;

    Ok(serde_json::json!({
        "method": rendered.method,
        "url": rendered.url,
        "headers": rendered.headers,
        "body": rendered.body,
    }))
}

#[tauri::command]
pub async fn api_extract_template_variables(template_str: String) -> Result<Vec<String>, String> {
    tracing::info!("Extracting template variables");

    let variables = crate::sys::api::TemplateEngine::extract_variables(&template_str);
    Ok(variables)
}

#[tauri::command]
pub async fn api_validate_template(template_str: String) -> Result<(), String> {
    tracing::info!("Validating template syntax");

    crate::sys::api::TemplateEngine::validate_template(&template_str)
        .map_err(|e| format!("Template validation failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    /// Packet-level negative test for the WebView egress bypass.
    ///
    /// The renderer's CSP cannot restrict a request that Rust makes on its
    /// behalf, so the proof that `api_*` is governed has to be that no TCP
    /// connection reaches the forbidden destination. A real listener on
    /// loopback counts connections; the guard must keep that count at zero.
    #[tokio::test]
    async fn renderer_requests_never_reach_loopback() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("failed to bind loopback listener");
        let addr = listener.local_addr().expect("listener has no address");

        let connections = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&connections);
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                observed.fetch_add(1, Ordering::SeqCst);
                // Answer so an unguarded client finishes fast instead of
                // hanging the test on the 30s request timeout.
                let _ = tokio::io::AsyncWriteExt::write_all(
                    &mut stream,
                    b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                )
                .await;
            }
        });

        let state = ApiState::new().expect("Failed to create ApiState");
        let error = state
            .execute_renderer_request(ApiRequest {
                method: HttpMethod::Get,
                url: format!("http://{addr}/"),
                ..Default::default()
            })
            .await
            .expect_err("a loopback destination must be refused");
        assert!(
            error.contains("egress policy"),
            "refusal should name the policy, got: {error}"
        );

        // Give a request that did escape time to land before counting.
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(
            connections.load(Ordering::SeqCst),
            0,
            "an api_* command opened a connection to loopback"
        );
    }

    #[tokio::test]
    async fn renderer_requests_refuse_metadata_local_names_and_odd_schemes() {
        let state = ApiState::new().expect("Failed to create ApiState");

        for url in [
            "http://169.254.169.254/latest/meta-data/",
            "http://localhost:11434/api/tags",
            "http://[::1]:8080/",
            "http://10.0.0.1.nip.io/",
            "file:///etc/passwd",
        ] {
            let result = state
                .execute_renderer_request(ApiRequest {
                    method: HttpMethod::Get,
                    url: url.to_string(),
                    ..Default::default()
                })
                .await;
            assert!(result.is_err(), "{url} must be refused");
        }
    }

    /// Answers for the one example host these cases use, so the policy decision
    /// under test does not depend on whether `idp.example.com` resolves. The
    /// egress policy fails closed on an unresolvable host, which is correct and
    /// is exactly what made this test fail against the real resolver.
    struct StubResolver;

    impl HostResolver for StubResolver {
        fn resolve(&self, host: &str, _port: u16) -> std::io::Result<Vec<std::net::IpAddr>> {
            match host {
                "idp.example.com" => Ok(vec![std::net::IpAddr::from([93, 184, 216, 34])]),
                other => Err(std::io::Error::other(format!("unexpected host {other}"))),
            }
        }
    }

    /// The token endpoint receives the client secret, so a renderer must not be
    /// able to point it at the local machine or a metadata service.
    #[test]
    fn oauth_endpoints_must_be_public() {
        let public = OAuth2Config {
            client_id: "test_client".to_string(),
            client_secret: Some("shhh".to_string()),
            auth_url: "https://idp.example.com/oauth/authorize".to_string(),
            token_url: "https://idp.example.com/oauth/token".to_string(),
            // A loopback callback is normal for a native OAuth client and must
            // stay allowed, the browser returns to it, we do not connect to it.
            redirect_uri: "http://localhost:3000/callback".to_string(),
            scopes: vec!["read".to_string()],
            use_pkce: true,
        };
        assert!(ensure_oauth_endpoints_public_with(&public, &StubResolver).is_ok());

        let stolen_secret = OAuth2Config {
            token_url: "http://127.0.0.1:9/token".to_string(),
            ..public.clone()
        };
        let error = ensure_oauth_endpoints_public_with(&stolen_secret, &StubResolver)
            .expect_err("a loopback token endpoint must be refused");
        assert!(error.starts_with("tokenUrl:"), "got: {error}");

        let metadata_auth = OAuth2Config {
            auth_url: "http://169.254.169.254/latest/meta-data/".to_string(),
            ..public.clone()
        };
        let error = ensure_oauth_endpoints_public_with(&metadata_auth, &StubResolver)
            .expect_err("a link-local auth endpoint must be refused");
        assert!(error.starts_with("authUrl:"), "got: {error}");

        let plaintext_token = OAuth2Config {
            token_url: "http://idp.example.com/oauth/token".to_string(),
            ..public.clone()
        };
        let error = ensure_oauth_endpoints_public_with(&plaintext_token, &StubResolver)
            .expect_err("a plaintext token endpoint must be refused");
        assert!(error.contains("must use https"), "got: {error}");

        let plaintext_auth = OAuth2Config {
            auth_url: "http://idp.example.com/oauth/authorize".to_string(),
            ..public
        };
        let error = ensure_oauth_endpoints_public_with(&plaintext_auth, &StubResolver)
            .expect_err("a plaintext auth endpoint must be refused");
        assert!(error.contains("must use https"), "got: {error}");
    }

    #[tokio::test]
    async fn test_api_state_creation() {
        let state = ApiState::new().expect("Failed to create ApiState");
        assert!(state.oauth_clients.lock().await.is_empty());
        assert!(state.pkce_challenges.lock().await.is_empty());
    }

    #[tokio::test]
    async fn test_oauth_client_management() {
        let state = ApiState::new().expect("Failed to create ApiState");

        let config = OAuth2Config {
            client_id: "test_client".to_string(),
            client_secret: None,
            auth_url: "https://example.com/oauth/authorize".to_string(),

            token_url: "https://example.com/oauth/token".to_string(),

            redirect_uri: "http://localhost:3000".to_string(),

            scopes: vec!["read".to_string()],
            use_pkce: true,
        };

        let oauth_client =
            OAuth2Client::new(config).expect("Failed to create OAuth client for test");
        state
            .oauth_clients
            .lock()
            .await
            .insert("test".to_string(), oauth_client);

        assert!(state.oauth_clients.lock().await.contains_key("test"));
    }
}
