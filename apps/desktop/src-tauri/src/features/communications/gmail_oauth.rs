//! Gmail OAuth 2.0 Client
//!
//! This module provides Gmail OAuth 2.0 authentication with PKCE support.
//! Tokens are stored securely using machine-derived encryption keys (not OS keyring)
//! to avoid permission prompts while maintaining strong security.
//!
//! # Scopes
//! - `gmail.readonly` - Read email messages and settings
//! - `gmail.send` - Send email on behalf of the user
//! - `gmail.modify` - Read, send, delete, and manage email
//!
//! # Example
//! ```ignore
//! let client = GmailOAuthClient::new(
//!     "client_id".to_string(),
//!     "client_secret".to_string(),
//!     "http://localhost:3000/callback".to_string(),
//! );
//!
//! // Generate authorization URL with PKCE
//! let (auth_url, state, pkce_verifier) = client.generate_auth_url();
//!
//! // After user authorizes, exchange the code
//! let token = client.exchange_code(&code, &pkce_verifier).await?;
//! ```

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::sys::api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse};
use crate::sys::error::{Error, Result};

// Google OAuth 2.0 endpoints
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

// Gmail API base URL
const GMAIL_API_BASE: &str = "https://gmail.googleapis.com/gmail/v1";

// Gmail OAuth scopes
const GMAIL_READONLY_SCOPE: &str = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE: &str = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_MODIFY_SCOPE: &str = "https://www.googleapis.com/auth/gmail.modify";
const USERINFO_EMAIL_SCOPE: &str = "https://www.googleapis.com/auth/userinfo.email";
const USERINFO_PROFILE_SCOPE: &str = "https://www.googleapis.com/auth/userinfo.profile";

/// Gmail OAuth settings for account configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailOAuthSettings {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

/// Information about a connected Gmail account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailAccountInfo {
    pub settings: GmailOAuthSettings,
    pub token: TokenResponse,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub picture_url: Option<String>,
}

/// Gmail account representation for API responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailAccount {
    pub account_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub picture_url: Option<String>,
    pub connected_at: DateTime<Utc>,
}

/// User profile information from Google
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailUserProfile {
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
    #[serde(rename = "verified_email")]
    pub verified_email: Option<bool>,
}

/// Pending OAuth state during authorization flow
struct PendingOAuth {
    settings: GmailOAuthSettings,
    pkce: PkceChallenge,
}

/// Gmail OAuth 2.0 client with PKCE support
#[derive(Clone)]
pub struct GmailOAuthClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl GmailOAuthClient {
    /// Create a new Gmail OAuth client
    ///
    /// # Arguments
    /// * `client_id` - Google OAuth client ID
    /// * `client_secret` - Google OAuth client secret
    /// * `redirect_uri` - OAuth redirect URI (must match Google Console configuration)
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Result<Self> {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: GOOGLE_AUTH_URL.to_string(),
            token_url: GOOGLE_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![
                GMAIL_READONLY_SCOPE.to_string(),
                GMAIL_SEND_SCOPE.to_string(),
                GMAIL_MODIFY_SCOPE.to_string(),
                USERINFO_EMAIL_SCOPE.to_string(),
                USERINFO_PROFILE_SCOPE.to_string(),
            ],
            use_pkce: true,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let oauth_client = OAuth2Client::new(oauth_config)
            .map_err(|e| Error::Other(format!("Failed to create OAuth client for Gmail: {}", e)))?;

        Ok(Self {
            client,
            oauth_client,
            token: None,
        })
    }

    /// Generate authorization URL with PKCE challenge
    ///
    /// Returns a tuple of (authorization_url, state, pkce_challenge)
    /// The state and PKCE verifier must be saved to complete the OAuth flow.
    pub fn generate_auth_url(&self, state: &str) -> (String, PkceChallenge) {
        let pkce = PkceChallenge::generate();
        let mut auth_url = self.oauth_client.get_authorization_url(state, Some(&pkce));

        // Add Gmail-specific parameters for offline access
        auth_url.push_str("&access_type=offline");
        auth_url.push_str("&prompt=consent");

        (auth_url, pkce)
    }

    /// Exchange authorization code for tokens
    ///
    /// # Arguments
    /// * `code` - Authorization code from OAuth callback
    /// * `pkce_verifier` - PKCE code verifier from initial authorization request
    ///
    /// # Returns
    /// Token response containing access token and optional refresh token
    pub async fn exchange_code(
        &mut self,
        code: &str,
        pkce_verifier: &str,
    ) -> Result<TokenResponse> {
        tracing::info!("Exchanging authorization code for Gmail tokens");

        let token = self
            .oauth_client
            .exchange_code(code, Some(pkce_verifier))
            .await?
            .with_expiration();

        tracing::info!("Successfully obtained Gmail access token");
        self.token = Some(token.clone());

        Ok(token)
    }

    /// Refresh the access token using a refresh token
    ///
    /// # Arguments
    /// * `refresh_token` - The refresh token from a previous authorization
    ///
    /// # Returns
    /// New token response with refreshed access token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse> {
        tracing::info!("Refreshing Gmail access token");

        let token = self
            .oauth_client
            .refresh_token(refresh_token)
            .await?
            .with_expiration();

        tracing::info!("Successfully refreshed Gmail access token");

        Ok(token)
    }

    /// Set the current token
    pub fn set_token(&mut self, token: TokenResponse) {
        self.token = Some(token);
    }

    /// Get the current token
    pub fn token(&self) -> Option<TokenResponse> {
        self.token.clone()
    }

    /// Get access token string for API requests
    fn get_access_token(&self) -> Result<&str> {
        self.token
            .as_ref()
            .map(|t| t.access_token.as_str())
            .ok_or_else(|| Error::Other("Not authenticated with Gmail".to_string()))
    }

    /// Ensure the token is valid, refreshing if necessary
    pub async fn ensure_valid_token(&mut self) -> Result<()> {
        if let Some(token) = &self.token {
            if token.is_expired() {
                tracing::info!("Gmail access token expired, refreshing");

                if let Some(ref refresh_token) = token.refresh_token {
                    let new_token = self.refresh_token(refresh_token).await?;
                    self.token = Some(new_token);
                    tracing::info!("Successfully refreshed Gmail access token");
                } else {
                    return Err(Error::Other(
                        "No refresh token available, re-authentication required".to_string(),
                    ));
                }
            }
        }

        Ok(())
    }

    /// Get user profile information from Google
    pub async fn get_user_profile(&mut self) -> Result<GmailUserProfile> {
        self.ensure_valid_token().await?;
        let token = self.get_access_token()?;

        tracing::debug!("Fetching Gmail user profile");

        let response = self
            .client
            .get(GOOGLE_USERINFO_URL)
            .bearer_auth(token)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to get user profile: {} - {}",
                status, error_text
            )));
        }

        let profile: GmailUserProfile = response.json().await?;

        tracing::debug!("Retrieved profile for: {}", profile.email);

        Ok(profile)
    }

    /// Get the user's Gmail profile (email address)
    pub async fn get_gmail_profile(&mut self) -> Result<String> {
        self.ensure_valid_token().await?;
        let token = self.get_access_token()?;

        let url = format!("{}/users/me/profile", GMAIL_API_BASE);

        let response = self.client.get(&url).bearer_auth(token).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(Error::Other(format!(
                "Failed to get Gmail profile: {} - {}",
                status, error_text
            )));
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct GmailProfile {
            email_address: String,
        }

        let profile: GmailProfile = response.json().await?;

        Ok(profile.email_address)
    }
}

/// Gmail OAuth manager for handling multiple accounts and OAuth flow state
pub struct GmailOAuthManager {
    clients: Arc<DashMap<String, GmailOAuthClient>>,
    accounts: Arc<DashMap<String, GmailAccountInfo>>,
    pending_auth: Arc<DashMap<String, PendingOAuth>>,
}

impl GmailOAuthManager {
    /// Create a new Gmail OAuth manager
    pub fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            accounts: Arc::new(DashMap::new()),
            pending_auth: Arc::new(DashMap::new()),
        }
    }

    /// Start OAuth flow for Gmail
    ///
    /// # Arguments
    /// * `client_id` - Google OAuth client ID
    /// * `client_secret` - Google OAuth client secret
    /// * `redirect_uri` - OAuth redirect URI
    ///
    /// # Returns
    /// Tuple of (authorization_url, state) - user should be redirected to the URL
    pub fn start_oauth(
        &self,
        client_id: String,
        client_secret: String,
        redirect_uri: String,
    ) -> Result<(String, String)> {
        let state = Uuid::new_v4().to_string();

        tracing::info!("Starting Gmail OAuth flow, state: {}", state);

        let client = GmailOAuthClient::new(
            client_id.clone(),
            client_secret.clone(),
            redirect_uri.clone(),
        )?;

        let (auth_url, pkce) = client.generate_auth_url(&state);

        self.pending_auth.insert(
            state.clone(),
            PendingOAuth {
                settings: GmailOAuthSettings {
                    client_id,
                    client_secret,
                    redirect_uri,
                },
                pkce,
            },
        );

        Ok((auth_url, state))
    }

    /// Take pending OAuth data for completion
    pub fn take_pending(&self, state: &str) -> Result<(GmailOAuthSettings, PkceChallenge)> {
        self.pending_auth
            .remove(state)
            .map(|entry| {
                let pending = entry.1;
                (pending.settings, pending.pkce)
            })
            .ok_or_else(|| Error::Other("Invalid state parameter".to_string()))
    }

    /// Complete the OAuth flow after user authorization
    pub async fn complete_oauth(
        settings: GmailOAuthSettings,
        pkce: PkceChallenge,
        code: &str,
    ) -> Result<(GmailAccountInfo, GmailOAuthClient)> {
        tracing::info!("Completing Gmail OAuth flow");

        let mut client = GmailOAuthClient::new(
            settings.client_id.clone(),
            settings.client_secret.clone(),
            settings.redirect_uri.clone(),
        )?;

        let token = client.exchange_code(code, &pkce.code_verifier).await?;

        // Get user profile to populate account info
        let (email, display_name, picture_url) = match client.get_user_profile().await {
            Ok(profile) => (Some(profile.email), profile.name, profile.picture),
            Err(e) => {
                tracing::warn!("Failed to get user profile: {}", e);
                // Try to get just the email from Gmail API
                match client.get_gmail_profile().await {
                    Ok(email) => (Some(email), None, None),
                    Err(_) => (None, None, None),
                }
            }
        };

        let info = GmailAccountInfo {
            settings,
            token,
            email,
            display_name,
            picture_url,
        };

        Ok((info, client))
    }

    /// Add or update an account in the manager
    pub fn upsert_account(
        &self,
        account_id: String,
        info: GmailAccountInfo,
        client: Option<GmailOAuthClient>,
    ) -> Result<()> {
        if let Some(client) = client {
            self.clients.insert(account_id.clone(), client);
        } else if !self.clients.contains_key(&account_id) {
            let mut client = GmailOAuthClient::new(
                info.settings.client_id.clone(),
                info.settings.client_secret.clone(),
                info.settings.redirect_uri.clone(),
            )?;
            client.set_token(info.token.clone());
            self.clients.insert(account_id.clone(), client);
        } else if let Some(mut entry) = self.clients.get_mut(&account_id) {
            entry.value_mut().set_token(info.token.clone());
        }

        self.accounts.insert(account_id, info);
        Ok(())
    }

    /// Remove an account from the manager
    pub fn remove_account(&self, account_id: &str) {
        self.clients.remove(account_id);
        self.accounts.remove(account_id);
    }

    /// List all account IDs
    pub fn list_accounts(&self) -> Vec<String> {
        self.accounts
            .iter()
            .map(|entry| entry.key().clone())
            .collect()
    }

    /// Get account info by ID
    pub fn account_info(&self, account_id: &str) -> Option<GmailAccountInfo> {
        self.accounts.get(account_id).map(|entry| entry.clone())
    }

    /// Get a mutable client reference for API operations
    pub async fn get_client(&self, account_id: &str) -> Result<GmailOAuthClient> {
        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Gmail account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;

        // Update stored token if refreshed
        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(client)
    }

    /// Refresh token for an account
    pub async fn refresh_account_token(&self, account_id: &str) -> Result<bool> {
        let info = self
            .accounts
            .get(account_id)
            .ok_or_else(|| Error::Other("Account not found".to_string()))?
            .clone();

        let refresh_token = info
            .token
            .refresh_token
            .ok_or_else(|| Error::Other("No refresh token available".to_string()))?;

        let client = GmailOAuthClient::new(
            info.settings.client_id.clone(),
            info.settings.client_secret.clone(),
            info.settings.redirect_uri.clone(),
        )?;

        let new_token = client.refresh_token(&refresh_token).await?;

        // Update the stored token
        if let Some(mut account_info) = self.accounts.get_mut(account_id) {
            // Preserve the refresh token if the new response doesn't include one
            let mut updated_token = new_token;
            if updated_token.refresh_token.is_none() {
                updated_token.refresh_token = Some(refresh_token);
            }
            account_info.token = updated_token.clone();

            // Update client token
            if let Some(mut client_entry) = self.clients.get_mut(account_id) {
                client_entry.set_token(updated_token);
            }
        }

        Ok(true)
    }
}

impl Default for GmailOAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gmail_oauth_client_creation() {
        let client = GmailOAuthClient::new(
            "test_client_id".to_string(),
            "test_client_secret".to_string(),
            "http://localhost:3000/callback".to_string(),
        )
        .expect("Failed to create client");

        assert!(client.token().is_none());
    }

    #[test]
    fn test_generate_auth_url() {
        let client = GmailOAuthClient::new(
            "test_client_id".to_string(),
            "test_client_secret".to_string(),
            "http://localhost:3000/callback".to_string(),
        )
        .expect("Failed to create client");

        let (auth_url, pkce) = client.generate_auth_url("test_state");

        assert!(auth_url.contains("accounts.google.com"));
        assert!(auth_url.contains("client_id=test_client_id"));
        assert!(auth_url.contains("state=test_state"));
        assert!(auth_url.contains("code_challenge="));
        assert!(auth_url.contains("access_type=offline"));
        assert!(auth_url.contains("gmail.readonly"));
        assert!(auth_url.contains("gmail.send"));
        assert!(auth_url.contains("gmail.modify"));
        assert!(!pkce.code_verifier.is_empty());
        assert!(!pkce.code_challenge.is_empty());
    }

    #[test]
    fn test_gmail_oauth_manager_creation() {
        let manager = GmailOAuthManager::new();
        assert_eq!(manager.list_accounts().len(), 0);
    }

    #[test]
    fn test_start_oauth() {
        let manager = GmailOAuthManager::new();

        let result = manager.start_oauth(
            "test_client_id".to_string(),
            "test_client_secret".to_string(),
            "http://localhost:3000/callback".to_string(),
        );

        assert!(result.is_ok());

        let (auth_url, state) = result.unwrap();
        assert!(auth_url.contains("accounts.google.com"));
        assert!(!state.is_empty());

        // Verify pending auth was stored
        let pending = manager.take_pending(&state);
        assert!(pending.is_ok());
    }

    #[test]
    fn test_take_pending_invalid_state() {
        let manager = GmailOAuthManager::new();
        let result = manager.take_pending("invalid_state");
        assert!(result.is_err());
    }

    #[test]
    fn test_account_management() {
        let manager = GmailOAuthManager::new();

        let settings = GmailOAuthSettings {
            client_id: "test_id".to_string(),
            client_secret: "test_secret".to_string(),
            redirect_uri: "http://localhost:3000".to_string(),
        };

        let token = TokenResponse {
            access_token: "test_access_token".to_string(),
            token_type: "Bearer".to_string(),
            expires_in: Some(3600),
            refresh_token: Some("test_refresh_token".to_string()),
            scope: Some("gmail.readonly".to_string()),
            expires_at: None,
        };

        let info = GmailAccountInfo {
            settings,
            token,
            email: Some("test@example.com".to_string()),
            display_name: Some("Test User".to_string()),
            picture_url: None,
        };

        manager
            .upsert_account("account_1".to_string(), info.clone(), None)
            .expect("Failed to upsert account");

        assert_eq!(manager.list_accounts().len(), 1);
        assert!(manager.account_info("account_1").is_some());

        let retrieved = manager.account_info("account_1").unwrap();
        assert_eq!(retrieved.email, Some("test@example.com".to_string()));

        manager.remove_account("account_1");
        assert_eq!(manager.list_accounts().len(), 0);
    }
}
