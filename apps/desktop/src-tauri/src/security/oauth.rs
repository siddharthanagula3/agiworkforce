use anyhow::{anyhow, Result};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// OAuth2 provider types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthProvider {
    Google,
    GitHub,
    Microsoft,
}

impl OAuthProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            OAuthProvider::Google => "google",
            OAuthProvider::GitHub => "github",
            OAuthProvider::Microsoft => "microsoft",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "google" => Some(OAuthProvider::Google),
            "github" => Some(OAuthProvider::GitHub),
            "microsoft" => Some(OAuthProvider::Microsoft),
            _ => None,
        }
    }

    /// Get authorization URL for the provider
    pub fn auth_url(&self) -> &'static str {
        match self {
            OAuthProvider::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            OAuthProvider::GitHub => "https://github.com/login/oauth/authorize",
            OAuthProvider::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
            }
        }
    }

    /// Get token URL for the provider
    pub fn token_url(&self) -> &'static str {
        match self {
            OAuthProvider::Google => "https://oauth2.googleapis.com/token",
            OAuthProvider::GitHub => "https://github.com/login/oauth/access_token",
            OAuthProvider::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/token"
            }
        }
    }

    /// Get default scopes for the provider
    pub fn default_scopes(&self) -> Vec<&'static str> {
        match self {
            OAuthProvider::Google => vec!["openid", "email", "profile"],
            OAuthProvider::GitHub => vec!["read:user", "user:email"],
            OAuthProvider::Microsoft => vec!["openid", "email", "profile"],
        }
    }
}

/// OAuth2 configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

/// OAuth2 authorization result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthAuthorizationUrl {
    pub url: String,
    pub state: String,
    pub pkce_verifier: String,
}

/// OAuth2 token result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub scope: Option<String>,
}

/// OAuth2 manager for handling multiple providers
pub struct OAuthManager {
    providers: Arc<parking_lot::RwLock<HashMap<OAuthProvider, OAuthConfig>>>,
    pending_verifiers: Arc<parking_lot::RwLock<HashMap<String, (OAuthProvider, String)>>>, // state -> (provider, verifier)
}

impl OAuthManager {
    pub fn new() -> Self {
        Self {
            providers: Arc::new(parking_lot::RwLock::new(HashMap::new())),
            pending_verifiers: Arc::new(parking_lot::RwLock::new(HashMap::new())),
        }
    }

    /// Configure an OAuth provider
    pub fn configure_provider(
        &self,
        provider: OAuthProvider,
        client_id: String,
        client_secret: String,
        redirect_uri: String,
    ) -> Result<()> {
        let config = OAuthConfig {
            client_id,
            client_secret,
            redirect_uri,
        };

        let mut providers = self.providers.write();
        providers.insert(provider, config);

        Ok(())
    }

    /// Generate authorization URL with PKCE
    pub fn get_authorization_url(
        &self,
        provider: OAuthProvider,
        scopes: Option<Vec<String>>,
    ) -> Result<OAuthAuthorizationUrl> {
        let providers = self.providers.read();
        let config = providers
            .get(&provider)
            .ok_or_else(|| anyhow!("Provider not configured: {:?}", provider))?;

        // Create OAuth2 client
        let client = BasicClient::new(
            ClientId::new(config.client_id.clone()),
            Some(ClientSecret::new(config.client_secret.clone())),
            AuthUrl::new(provider.auth_url().to_string())?,
            Some(TokenUrl::new(provider.token_url().to_string())?),
        )
        .set_redirect_uri(RedirectUrl::new(config.redirect_uri.clone())?);

        // Generate PKCE challenge
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        // Determine scopes
        let scope_list = scopes.unwrap_or_else(|| {
            provider
                .default_scopes()
                .into_iter()
                .map(|s| s.to_string())
                .collect()
        });

        // Build authorization URL
        let mut auth_request = client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge);

        for scope in scope_list {
            auth_request = auth_request.add_scope(Scope::new(scope));
        }

        let (auth_url, csrf_state) = auth_request.url();

        // Store PKCE verifier for later use
        let mut verifiers = self.pending_verifiers.write();
        verifiers.insert(
            csrf_state.secret().clone(),
            (provider, pkce_verifier.secret().clone()),
        );

        Ok(OAuthAuthorizationUrl {
            url: auth_url.to_string(),
            state: csrf_state.secret().clone(),
            pkce_verifier: pkce_verifier.secret().clone(),
        })
    }

    /// Exchange authorization code for access token
    pub async fn exchange_code(
        &self,
        provider: OAuthProvider,
        code: String,
        state: String,
    ) -> Result<OAuthTokenResult> {
        // Retrieve and remove PKCE verifier
        let (stored_provider, verifier) = {
            let mut verifiers = self.pending_verifiers.write();
            verifiers
                .remove(&state)
                .ok_or_else(|| anyhow!("Invalid or expired state"))?
        };

        if stored_provider != provider {
            return Err(anyhow!("Provider mismatch"));
        }

        let providers = self.providers.read();
        let config = providers
            .get(&provider)
            .ok_or_else(|| anyhow!("Provider not configured: {:?}", provider))?;

        // Create OAuth2 client
        let client = BasicClient::new(
            ClientId::new(config.client_id.clone()),
            Some(ClientSecret::new(config.client_secret.clone())),
            AuthUrl::new(provider.auth_url().to_string())?,
            Some(TokenUrl::new(provider.token_url().to_string())?),
        )
        .set_redirect_uri(RedirectUrl::new(config.redirect_uri.clone())?);

        // Exchange code for token
        let token_result = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(PkceCodeVerifier::new(verifier))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| anyhow!("Token exchange failed: {}", e))?;

        Ok(OAuthTokenResult {
            access_token: token_result.access_token().secret().clone(),
            refresh_token: token_result
                .refresh_token()
                .map(|t| t.secret().clone()),
            expires_in: token_result.expires_in().map(|d| d.as_secs()),
            scope: token_result
                .scopes()
                .map(|scopes| {
                    scopes
                        .iter()
                        .map(|s| s.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                }),
        })
    }

    /// Refresh access token
    pub async fn refresh_token(
        &self,
        provider: OAuthProvider,
        refresh_token: String,
    ) -> Result<OAuthTokenResult> {
        let providers = self.providers.read();
        let config = providers
            .get(&provider)
            .ok_or_else(|| anyhow!("Provider not configured: {:?}", provider))?;

        // Create OAuth2 client
        let client = BasicClient::new(
            ClientId::new(config.client_id.clone()),
            Some(ClientSecret::new(config.client_secret.clone())),
            AuthUrl::new(provider.auth_url().to_string())?,
            Some(TokenUrl::new(provider.token_url().to_string())?),
        )
        .set_redirect_uri(RedirectUrl::new(config.redirect_uri.clone())?);

        // Refresh token
        let token_result = client
            .exchange_refresh_token(&oauth2::RefreshToken::new(refresh_token))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| anyhow!("Token refresh failed: {}", e))?;

        Ok(OAuthTokenResult {
            access_token: token_result.access_token().secret().clone(),
            refresh_token: token_result
                .refresh_token()
                .map(|t| t.secret().clone()),
            expires_in: token_result.expires_in().map(|d| d.as_secs()),
            scope: token_result
                .scopes()
                .map(|scopes| {
                    scopes
                        .iter()
                        .map(|s| s.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                }),
        })
    }

    /// Get user info from OAuth provider
    pub async fn get_user_info(
        &self,
        provider: OAuthProvider,
        access_token: &str,
    ) -> Result<OAuthUserInfo> {
        let url = match provider {
            OAuthProvider::Google => "https://www.googleapis.com/oauth2/v2/userinfo",
            OAuthProvider::GitHub => "https://api.github.com/user",
            OAuthProvider::Microsoft => "https://graph.microsoft.com/v1.0/me",
        };

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to get user info: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Failed to get user info: {}",
                response.status()
            ));
        }

        let user_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse user info: {}", e))?;

        // Extract user info based on provider
        let user_info = match provider {
            OAuthProvider::Google => OAuthUserInfo {
                provider_user_id: user_data["id"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing user ID"))?
                    .to_string(),
                email: user_data["email"]
                    .as_str()
                    .map(|s| s.to_string()),
                name: user_data["name"]
                    .as_str()
                    .map(|s| s.to_string()),
                picture: user_data["picture"]
                    .as_str()
                    .map(|s| s.to_string()),
            },
            OAuthProvider::GitHub => {
                let email = if user_data["email"].is_null() {
                    // GitHub may not return email in user info, need to fetch separately
                    let email_response = client
                        .get("https://api.github.com/user/emails")
                        .bearer_auth(access_token)
                        .send()
                        .await?;

                    if email_response.status().is_success() {
                        let emails: Vec<serde_json::Value> = email_response.json().await?;
                        emails
                            .iter()
                            .find(|e| e["primary"].as_bool() == Some(true))
                            .and_then(|e| e["email"].as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                } else {
                    user_data["email"].as_str().map(|s| s.to_string())
                };

                OAuthUserInfo {
                    provider_user_id: user_data["id"]
                        .as_i64()
                        .ok_or_else(|| anyhow!("Missing user ID"))?
                        .to_string(),
                    email,
                    name: user_data["name"]
                        .as_str()
                        .or(user_data["login"].as_str())
                        .map(|s| s.to_string()),
                    picture: user_data["avatar_url"]
                        .as_str()
                        .map(|s| s.to_string()),
                }
            }
            OAuthProvider::Microsoft => OAuthUserInfo {
                provider_user_id: user_data["id"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Missing user ID"))?
                    .to_string(),
                email: user_data["mail"]
                    .as_str()
                    .or(user_data["userPrincipalName"].as_str())
                    .map(|s| s.to_string()),
                name: user_data["displayName"]
                    .as_str()
                    .map(|s| s.to_string()),
                picture: None, // Microsoft Graph doesn't return picture in basic profile
            },
        };

        Ok(user_info)
    }
}

impl Default for OAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

/// OAuth user information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthUserInfo {
    pub provider_user_id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_urls() {
        assert_eq!(
            OAuthProvider::Google.auth_url(),
            "https://accounts.google.com/o/oauth2/v2/auth"
        );
        assert_eq!(
            OAuthProvider::GitHub.auth_url(),
            "https://github.com/login/oauth/authorize"
        );
    }

    #[test]
    fn test_provider_from_str() {
        assert_eq!(
            OAuthProvider::from_str("google"),
            Some(OAuthProvider::Google)
        );
        assert_eq!(
            OAuthProvider::from_str("github"),
            Some(OAuthProvider::GitHub)
        );
        assert_eq!(OAuthProvider::from_str("invalid"), None);
    }

    #[tokio::test]
    async fn test_oauth_manager() {
        let manager = OAuthManager::new();

        let result = manager.configure_provider(
            OAuthProvider::Google,
            "test_client_id".to_string(),
            "test_client_secret".to_string(),
            "http://localhost:3000/callback".to_string(),
        );

        assert!(result.is_ok());

        let auth_url = manager
            .get_authorization_url(OAuthProvider::Google, None)
            .unwrap();

        assert!(auth_url.url.contains("accounts.google.com"));
        assert!(!auth_url.state.is_empty());
        assert!(!auth_url.pkce_verifier.is_empty());
    }
}
