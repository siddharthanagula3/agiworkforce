use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{Error, Result};

/// OAuth 2.0 configuration
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

/// OAuth 2.0 token response
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
    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            return now >= expires_at;
        }
        false
    }

    /// Calculate expiration timestamp
    pub fn with_expiration(mut self) -> Self {
        if let Some(expires_in) = self.expires_in {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            self.expires_at = Some(now + expires_in);
        }
        self
    }
}

/// PKCE (Proof Key for Code Exchange) challenge
#[derive(Debug, Clone)]
pub struct PkceChallenge {
    pub code_verifier: String,
    pub code_challenge: String,
}

impl PkceChallenge {
    /// Generate new PKCE challenge
    pub fn generate() -> Self {
        // Generate random code verifier (43-128 characters)
        let code_verifier: String = (0..64)
            .map(|_| {
                let idx = rand::random::<usize>() % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();

        // Generate code challenge (SHA256 hash of verifier, base64 URL encoded)
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = STANDARD.encode(hash);

        Self {
            code_verifier,
            code_challenge,
        }
    }
}

/// OAuth 2.0 Client
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
    /// Create new OAuth 2.0 client
    pub fn new(config: OAuth2Config) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self { config, client }
    }

    /// Get the configured client ID
    pub fn client_id(&self) -> &str {
        &self.config.client_id
    }

    /// Get the configured redirect URI
    pub fn redirect_uri(&self) -> &str {
        &self.config.redirect_uri
    }

    /// Returns true when PKCE should be used
    pub fn uses_pkce(&self) -> bool {
        self.config.use_pkce
    }

    /// Get authorization URL
    pub fn get_authorization_url(&self, state: &str, pkce: Option<&PkceChallenge>) -> String {
        let mut params = vec![
            ("client_id", self.config.client_id.as_str()),
            ("redirect_uri", self.config.redirect_uri.as_str()),
            ("response_type", "code"),
            ("state", state),
        ];

        // Add scopes
        let scope_string = self.config.scopes.join(" ");
        params.push(("scope", &scope_string));

        // Add PKCE challenge if using PKCE
        if let Some(pkce_challenge) = pkce {
            params.push(("code_challenge", &pkce_challenge.code_challenge));
            params.push(("code_challenge_method", "S256"));
        }

        // Build URL
        let query_string: String = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");

        format!("{}?{}", self.config.auth_url, query_string)
    }

    /// Exchange authorization code for access token
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

        // Add client secret if available (for confidential clients)
        if let Some(ref secret) = self.config.client_secret {
            params.insert("client_secret", secret);
        }

        // Add PKCE code verifier if using PKCE
        if let Some(verifier) = code_verifier {
            params.insert("code_verifier", verifier);
        }

        // Send request
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

    /// Refresh access token using refresh token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse> {
        tracing::info!("Refreshing access token");

        let mut params = HashMap::new();
        params.insert("grant_type", "refresh_token");
        params.insert("refresh_token", refresh_token);
        params.insert("client_id", &self.config.client_id);

        // Add client secret if available
        if let Some(ref secret) = self.config.client_secret {
            params.insert("client_secret", secret);
        }

        // Send request
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

    /// Client Credentials flow (for machine-to-machine authentication)
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

        // Add scopes if present
        if let Some(ref scopes) = scope_string {
            params.insert("scope", scopes);
        }

        // Send request
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

        // Verify code verifier length
        assert_eq!(challenge.code_verifier.len(), 64);

        // Verify code challenge is base64 encoded
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

        // Not expired initially (no expiration set)
        assert!(!token.is_expired());

        // Set expiration
        token = token.with_expiration();
        assert!(token.expires_at.is_some());

        // Should not be expired (expires in 3600 seconds)
        assert!(!token.is_expired());

        // Set expiration in the past
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
            redirect_uri: "http://localhost:8080/callback".to_string(),
            scopes: vec!["read".to_string(), "write".to_string()],
            use_pkce: true,
        };

        let client = OAuth2Client::new(config);
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
}
