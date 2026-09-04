use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sys::error::{Error, Result};
use crate::sys::security::egress_policy::public_destination_redirect_policy;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuth2Config {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub auth_url: String,
    pub token_url: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub use_pkce: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    #[serde(skip)]
    pub expires_at: Option<u64>,
}

impl TokenResponse {
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            return now >= expires_at;
        }
        false
    }

    pub fn with_expiration(mut self) -> Self {
        if let Some(expires_in) = self.expires_in {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            self.expires_at = Some(now + expires_in);
        }
        self
    }
}

#[derive(Debug, Clone)]
pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
}

impl PkceChallenge {
    pub fn generate() -> Self {
        let code_verifier: String = (0..64)
            .map(|_| {
                let idx = rand::random::<usize>() % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();

        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = URL_SAFE_NO_PAD.encode(hash);

        Self {
            code_verifier,
            code_challenge,
        }
    }
}

pub struct OAuth2Client {
    config: OAuth2Config,
    client: Client,
}

impl Clone for OAuth2Client {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            client: self.client.clone(),
        }
    }
}

impl OAuth2Client {
    pub fn new(config: OAuth2Config) -> crate::sys::error::Result<Self> {
        // `token_url` is judged once, by `ensure_oauth_endpoints_public`, before
        // this client is built. That check is worth nothing on its own while the
        // client then follows up to ten `Location:` headers unjudged: the three
        // token calls below POST `client_secret` in a form body, and a 307/308
        // preserves both method and body, so an allowed token endpoint that
        // redirects can replay the secret to a destination nobody judged.
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .redirect(public_destination_redirect_policy())
            .build()
            .map_err(|e| {
                crate::sys::error::Error::Other(format!(
                    "Failed to create HTTP client for OAuth2: {}",
                    e
                ))
            })?;

        Ok(Self { config, client })
    }

    pub fn client_id(&self) -> &str {
        &self.config.client_id
    }

    pub fn redirect_uri(&self) -> &str {
        &self.config.redirect_uri
    }

    pub fn uses_pkce(&self) -> bool {
        self.config.use_pkce
    }

    pub fn get_authorization_url(&self, state: &str, pkce: Option<&PkceChallenge>) -> String {
        let mut params = vec![
            ("client_id", self.config.client_id.as_str()),
            ("redirect_uri", self.config.redirect_uri.as_str()),
            ("response_type", "code"),
            ("state", state),
        ];

        let scope_string = self.config.scopes.join(" ");
        params.push(("scope", &scope_string));

        if let Some(pkce_challenge) = pkce {
            params.push(("code_challenge", &pkce_challenge.code_challenge));
            params.push(("code_challenge_method", "S256"));
        }

        let query_string: String = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        format!("{}?{}", self.config.auth_url, query_string)
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        code_verifier: Option<&str>,
    ) -> Result<TokenResponse> {
        tracing::info!("Exchanging authorization code for access token");

        let mut params = HashMap::new();
        params.insert("grant_type", "authorization_code");
        params.insert("code", code);
        params.insert("redirect_uri", &self.config.redirect_uri);
        params.insert("client_id", &self.config.client_id);

        if let Some(ref secret) = self.config.client_secret {
            params.insert("client_secret", secret);
        }

        if let Some(verifier) = code_verifier {
            params.insert("code_verifier", verifier);
        }

        let response = self
            .client
            .post(&self.config.token_url)
            .form(&params)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to exchange code: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::Other(format!(
                "Token exchange failed: {} - {}",
                status, error_text
            )));
        }

        let token_response: TokenResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse token response: {}", e)))?;

        tracing::info!("Successfully obtained access token");

        Ok(token_response.with_expiration())
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse> {
        tracing::info!("Refreshing access token");

        let mut params = HashMap::new();
        params.insert("grant_type", "refresh_token");
        params.insert("refresh_token", refresh_token);
        params.insert("client_id", &self.config.client_id);

        if let Some(ref secret) = self.config.client_secret {
            params.insert("client_secret", secret);
        }

        let response = self
            .client
            .post(&self.config.token_url)
            .form(&params)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::Other(format!(
                "Token refresh failed: {} - {}",
                status, error_text
            )));
        }

        let token_response: TokenResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse token response: {}", e)))?;

        tracing::info!("Successfully refreshed access token");

        Ok(token_response.with_expiration())
    }

    pub async fn client_credentials(&self) -> Result<TokenResponse> {
        tracing::info!("Obtaining token via client credentials flow");

        let client_secret = self.config.client_secret.as_ref().ok_or_else(|| {
            Error::Other("Client secret required for client credentials flow".to_string())
        })?;

        let scope_string = if !self.config.scopes.is_empty() {
            Some(self.config.scopes.join(" "))
        } else {
            None
        };

        let mut params = HashMap::new();
        params.insert("grant_type", "client_credentials");
        params.insert("client_id", &self.config.client_id);
        params.insert("client_secret", client_secret);

        if let Some(ref scopes) = scope_string {
            params.insert("scope", scopes);
        }

        let response = self
            .client
            .post(&self.config.token_url)
            .form(&params)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to get token: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::Other(format!(
                "Client credentials flow failed: {} - {}",
                status, error_text
            )));
        }

        let token_response: TokenResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse token response: {}", e)))?;

        tracing::info!("Successfully obtained token via client credentials");

        Ok(token_response.with_expiration())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_challenge_generation() {
        let challenge = PkceChallenge::generate();

        assert_eq!(challenge.code_verifier.len(), 64);

        assert!(!challenge.code_challenge.is_empty());
    }

    #[test]
    fn test_token_expiration() {
        let mut token = TokenResponse {
            access_token: "test_token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: None,
            scope: None,
            expires_at: None,
        };

        assert!(!token.is_expired());

        token = token.with_expiration();
        assert!(token.expires_at.is_some());

        assert!(!token.is_expired());

        token.expires_at = Some(0);
        assert!(token.is_expired());
    }

    #[test]
    fn test_authorization_url_generation() {
        let config = OAuth2Config {
            client_id: "test_client".to_string(),
            client_secret: None,
            auth_url: "https://example.com/oauth/authorize".to_string(),

            token_url: "https://example.com/oauth/token".to_string(),

            redirect_uri: "http://localhost:3000".to_string(),

            scopes: vec!["read".to_string(), "write".to_string()],
            use_pkce: true,
        };

        let client = OAuth2Client::new(config).expect("Failed to create OAuth2 client for test");
        let pkce = PkceChallenge::generate();
        let url = client.get_authorization_url("random_state", Some(&pkce));

        assert!(url.contains("client_id=test_client"));
        assert!(url.contains("redirect_uri=http"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("state=random_state"));
        assert!(url.contains("scope=read"));
        assert!(url.contains("code_challenge="));
        assert!(url.contains("code_challenge_method=S256"));
    }

    /// The token endpoint is judged once, before this client exists. That check
    /// is worthless while the client follows `Location:` unjudged: a 307
    /// preserves method AND body, so the `client_secret` in the form body is
    /// replayed verbatim to wherever the redirect points. This asserts the
    /// second hop into loopback is never opened, and therefore that the secret
    /// never leaves for it.
    #[tokio::test]
    async fn token_requests_do_not_replay_the_client_secret_across_a_redirect() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        /// Answers every connection with a fixed response, counting hits and
        /// recording the request bytes it saw.
        async fn serve(
            response: String,
            hits: Arc<AtomicUsize>,
            seen: Arc<std::sync::Mutex<Vec<String>>>,
        ) -> std::net::SocketAddr {
            let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
            let address = listener.local_addr().expect("local addr");
            tokio::spawn(async move {
                while let Ok((mut stream, _)) = listener.accept().await {
                    hits.fetch_add(1, Ordering::SeqCst);
                    let mut buffer = [0_u8; 2048];
                    let read = stream.read(&mut buffer).await.unwrap_or(0);
                    seen.lock()
                        .expect("record request")
                        .push(String::from_utf8_lossy(&buffer[..read]).to_string());
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                }
            });
            address
        }

        let sink_hits = Arc::new(AtomicUsize::new(0));
        let sink_seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = serve(
            "HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{}".to_string(),
            Arc::clone(&sink_hits),
            Arc::clone(&sink_seen),
        )
        .await;

        let token_hits = Arc::new(AtomicUsize::new(0));
        let token = serve(
            format!(
                "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{sink}/steal\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
            ),
            Arc::clone(&token_hits),
            Arc::new(std::sync::Mutex::new(Vec::new())),
        )
        .await;

        let client = OAuth2Client::new(OAuth2Config {
            client_id: "test_client".to_string(),
            client_secret: Some("SUPER_SECRET".to_string()),
            auth_url: format!("http://{token}/authorize"),
            token_url: format!("http://{token}/token"),
            redirect_uri: "http://localhost:3000".to_string(),
            scopes: vec![],
            use_pkce: false,
        })
        .expect("create OAuth2 client for test");

        let result = client.exchange_code("auth_code", None).await;
        assert!(
            result.is_err(),
            "a token redirect into loopback must not be followed"
        );

        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        // Leak first: when this fires it prints the bytes that escaped, which is
        // the whole point of the test.
        let leaked = sink_seen.lock().expect("read recorded requests").clone();
        assert!(
            leaked.is_empty(),
            "client_secret was replayed to the redirect target: {leaked:?}"
        );
        assert_eq!(
            sink_hits.load(Ordering::SeqCst),
            0,
            "the client followed a redirect into loopback"
        );
        assert_eq!(
            token_hits.load(Ordering::SeqCst),
            1,
            "the token endpoint itself should still be called once"
        );
    }
}
