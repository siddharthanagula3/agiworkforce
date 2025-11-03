mod dropbox;
mod google_drive;
mod one_drive;

pub use dropbox::DropboxClient;
pub use google_drive::GoogleDriveClient;
pub use one_drive::OneDriveClient;

use crate::api::oauth::PkceChallenge;
use crate::error::{Error, Result};
use dashmap::DashMap;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Supported cloud storage providers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudProvider {
    GoogleDrive,
    Dropbox,
    OneDrive,
}

/// Summary information for a connected cloud account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudAccount {
    pub account_id: String,
    pub provider: CloudProvider,
    pub label: Option<String>,
}

/// File metadata returned from unified cloud storage APIs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub mime_type: Option<String>,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    pub is_folder: bool,
    pub share_link: Option<String>,
}

/// Response payload when generating a share link
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareLink {
    pub url: String,
    pub expires_at: Option<String>,
    pub scope: Option<String>,
    pub allow_edit: bool,
}

/// Options for listing or searching files within a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListOptions {
    pub folder_path: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub include_folders: bool,
}

/// OAuth configuration required to connect a provider
#[derive(Debug, Clone, Deserialize)]
pub struct CloudOAuthConfig {
    pub provider: CloudProvider,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub redirect_uri: String,
}

struct PendingAuth {
    provider: CloudProvider,
    client: CloudClient,
    pkce: Option<PkceChallenge>,
}

struct AccountEntry {
    provider: CloudProvider,
    label: Option<String>,
    client: Arc<Mutex<CloudClient>>,
}

/// Manager responsible for handling multiple cloud storage accounts
pub struct CloudStorageManager {
    accounts: DashMap<String, AccountEntry>,
    pending: DashMap<String, PendingAuth>,
}

impl CloudStorageManager {
    pub fn new() -> Self {
        Self {
            accounts: DashMap::new(),
            pending: DashMap::new(),
        }
    }

    /// Start the OAuth flow for the requested provider
    pub fn start_oauth(&self, config: CloudOAuthConfig) -> Result<(String, String)> {
        let client = CloudClient::from_oauth_config(&config)?;
        let state = Uuid::new_v4().to_string();
        let (auth_url, pkce) = client.start_authorization(&state);

        self.pending.insert(
            state.clone(),
            PendingAuth {
                provider: config.provider,
                client,
                pkce,
            },
        );

        Ok((auth_url, state))
    }

    /// Complete OAuth with a verification code and persist the account
    pub async fn complete_oauth(&self, state: &str, code: &str) -> Result<String> {
        let (_, mut pending) = self
            .pending
            .remove(state)
            .ok_or_else(|| Error::Other("Invalid or expired OAuth state".to_string()))?;

        let verifier = pending
            .pkce
            .as_ref()
            .map(|pkce| pkce.code_verifier.as_str());
        pending.client.authorize_with_code(code, verifier).await?;

        let account_id = Uuid::new_v4().to_string();
        let label = match pending.client.account_label().await {
            Ok(label) => label,
            Err(err) => {
                tracing::warn!("Failed to fetch cloud account label: {}", err);
                None
            }
        };
        let provider = pending.provider;
        let client = Arc::new(Mutex::new(pending.client));

        self.accounts.insert(
            account_id.clone(),
            AccountEntry {
                provider,
                label,
                client,
            },
        );

        Ok(account_id)
    }

    /// Disconnect an account and drop its credentials
    pub fn disconnect(&self, account_id: &str) -> Result<()> {
        self.accounts
            .remove(account_id)
            .ok_or_else(|| Error::Other("Account not found".to_string()))?;
        Ok(())
    }

    /// List all connected accounts
    pub fn list_accounts(&self) -> Vec<CloudAccount> {
        self.accounts
            .iter()
            .map(|entry| CloudAccount {
                account_id: entry.key().clone(),
                provider: entry.value().provider,
                label: entry.value().label.clone(),
            })
            .collect()
    }

    /// Execute an async operation with a mutable client reference
    pub async fn with_client<F, T>(&self, account_id: &str, f: F) -> Result<T>
    where
        F: FnOnce(&mut CloudClient) -> BoxFuture<'_, Result<T>>,
    {
        let entry = self
            .accounts
            .get(account_id)
            .ok_or_else(|| Error::Other("Account not found".to_string()))?;

        let client = Arc::clone(&entry.client);
        drop(entry);

        let mut guard = client.lock().await;
        f(&mut guard).await
    }
}

/// Unified cloud client over provider-specific implementations
pub enum CloudClient {
    Google(GoogleDriveClient),
    Dropbox(DropboxClient),
    OneDrive(OneDriveClient),
}

impl CloudClient {
    fn from_oauth_config(config: &CloudOAuthConfig) -> Result<Self> {
        match config.provider {
            CloudProvider::GoogleDrive => Ok(Self::Google(GoogleDriveClient::new(
                config.client_id.clone(),
                config.client_secret.clone().ok_or_else(|| {
                    Error::Other("Client secret required for Google Drive".to_string())
                })?,
                config.redirect_uri.clone(),
            ))),
            CloudProvider::Dropbox => Ok(Self::Dropbox(DropboxClient::new(
                config.client_id.clone(),
                config.client_secret.clone().ok_or_else(|| {
                    Error::Other("Client secret required for Dropbox".to_string())
                })?,
                config.redirect_uri.clone(),
            ))),
            CloudProvider::OneDrive => Ok(Self::OneDrive(OneDriveClient::new(
                config.client_id.clone(),
                config.client_secret.clone().ok_or_else(|| {
                    Error::Other("Client secret required for OneDrive".to_string())
                })?,
                config.redirect_uri.clone(),
            ))),
        }
    }

    fn start_authorization(&self, state: &str) -> (String, Option<PkceChallenge>) {
        match self {
            CloudClient::Google(client) => client.get_authorization_url(state),
            CloudClient::Dropbox(client) => client.get_authorization_url(state),
            CloudClient::OneDrive(client) => client.get_authorization_url(state),
        }
    }

    async fn authorize_with_code(&mut self, code: &str, verifier: Option<&str>) -> Result<()> {
        match self {
            CloudClient::Google(client) => client.authorize_with_code(code, verifier).await,
            CloudClient::Dropbox(client) => client.authorize_with_code(code).await,
            CloudClient::OneDrive(client) => client.authorize_with_code(code, verifier).await,
        }
    }

    async fn account_label(&self) -> Result<Option<String>> {
        match self {
            CloudClient::Google(client) => client.get_account_email().await,
            CloudClient::Dropbox(client) => client.get_account_name().await,
            CloudClient::OneDrive(client) => client.get_account_display_name().await,
        }
    }

    pub async fn list(&mut self, options: ListOptions) -> Result<Vec<CloudFile>> {
        match self {
            CloudClient::Google(client) => client.list(options).await,
            CloudClient::Dropbox(client) => client.list(options).await,
            CloudClient::OneDrive(client) => client.list(options).await,
        }
    }

    pub async fn upload(&mut self, local_path: &str, remote_path: &str) -> Result<String> {
        match self {
            CloudClient::Google(client) => client.upload(local_path, remote_path).await,
            CloudClient::Dropbox(client) => client.upload(local_path, remote_path).await,
            CloudClient::OneDrive(client) => client.upload(local_path, remote_path).await,
        }
    }

    pub async fn download(&mut self, remote_path: &str, local_path: &str) -> Result<()> {
        match self {
            CloudClient::Google(client) => client.download(remote_path, local_path).await,
            CloudClient::Dropbox(client) => client.download(remote_path, local_path).await,
            CloudClient::OneDrive(client) => client.download(remote_path, local_path).await,
        }
    }

    pub async fn delete(&mut self, remote_path: &str) -> Result<()> {
        match self {
            CloudClient::Google(client) => client.delete(remote_path).await,
            CloudClient::Dropbox(client) => client.delete(remote_path).await,
            CloudClient::OneDrive(client) => client.delete(remote_path).await,
        }
    }

    pub async fn create_folder(&mut self, folder_path: &str) -> Result<String> {
        match self {
            CloudClient::Google(client) => client.create_folder(folder_path).await,
            CloudClient::Dropbox(client) => client.create_folder(folder_path).await,
            CloudClient::OneDrive(client) => client.create_folder(folder_path).await,
        }
    }

    pub async fn share_link(&mut self, remote_path: &str, allow_edit: bool) -> Result<ShareLink> {
        match self {
            CloudClient::Google(client) => client.share_link(remote_path, allow_edit).await,
            CloudClient::Dropbox(client) => client.share_link(remote_path, allow_edit).await,
            CloudClient::OneDrive(client) => client.share_link(remote_path, allow_edit).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manager_creation() {
        let manager = CloudStorageManager::new();
        assert_eq!(manager.list_accounts().len(), 0);
    }
}
