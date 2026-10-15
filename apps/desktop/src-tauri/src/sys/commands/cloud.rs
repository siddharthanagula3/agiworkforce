use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::{
    integrations::cloud::{
        CloudAccount, CloudOAuthConfig, CloudStorageManager, ListOptions, ShareLink,
    },
    sys::error::Result,
};
use uuid::Uuid;

pub struct CloudState {
    pub manager: Arc<CloudStorageManager>,
}

impl Default for CloudState {
    fn default() -> Self {
        Self::new()
    }
}

impl CloudState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(CloudStorageManager::new()),
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCompleteOAuthRequest {
    pub state: String,
    pub code: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CloudAuthorizationResponse {
    pub auth_url: String,
    pub state: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CloudAccountResponse {
    pub account_id: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudListRequest {
    pub account_id: String,
    pub folder_path: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub include_folders: bool,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPathRequest {
    pub account_id: String,
    pub remote_path: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUploadRequest {
    pub account_id: String,
    pub local_path: String,
    pub remote_path: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDownloadRequest {
    pub account_id: String,
    pub remote_path: String,
    pub local_path: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareRequest {
    pub account_id: String,
    pub remote_path: String,
    #[serde(default)]
    pub allow_edit: bool,
}

#[tauri::command]
pub async fn cloud_connect(
    config: CloudOAuthConfig,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<CloudAuthorizationResponse> {
    tracing::info!("Starting OAuth for provider {:?}", config.provider);

    let (auth_url, oauth_state) = state.manager.start_oauth(config.clone())?;
    let _ = app.emit("cloud:auth_started", &config.provider);

    Ok(CloudAuthorizationResponse {
        auth_url,
        state: oauth_state,
    })
}

#[tauri::command]
pub async fn cloud_complete_oauth(
    request: CloudCompleteOAuthRequest,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<CloudAccountResponse> {
    tracing::info!("Completing OAuth for state {}", request.state);

    let account_id = state
        .manager
        .complete_oauth(&request.state, &request.code)
        .await?;
    let _ = app.emit("cloud:connected", &account_id);

    Ok(CloudAccountResponse { account_id })
}

#[tauri::command]
pub async fn cloud_disconnect(account_id: String, state: State<'_, CloudState>) -> Result<()> {
    state.manager.disconnect(&account_id)?;
    tracing::info!("Disconnected a cloud storage account");
    Ok(())
}

#[tauri::command]
pub async fn cloud_list_accounts(state: State<'_, CloudState>) -> Result<Vec<CloudAccount>> {
    Ok(state.manager.list_accounts())
}

#[tauri::command]
pub async fn cloud_list(
    request: CloudListRequest,
    state: State<'_, CloudState>,
) -> Result<Vec<crate::integrations::cloud::CloudFile>> {
    let options = ListOptions {
        folder_path: request.folder_path.clone(),
        search: request.search.clone(),
        include_folders: request.include_folders,
    };

    state
        .manager
        .with_client(&request.account_id, move |client| {
            let options = options.clone();
            Box::pin(async move { client.list(options).await })
        })
        .await
}

#[tauri::command]
pub async fn cloud_upload(
    request: CloudUploadRequest,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<String> {
    let account_id = request.account_id.clone();
    let remote_path = request.remote_path.clone();
    let local_path = request.local_path.clone();

    // E2EE: Encrypt file to a temporary location before upload
    let temp_name = format!("{}.enc", Uuid::new_v4());
    let temp_path_buf = std::env::temp_dir().join(&temp_name);
    let temp_path = temp_path_buf.to_string_lossy().to_string();

    // Derive encryption key
    let key = crate::sys::security::machine_key::derive_key(
        crate::sys::security::machine_key::KeyPurpose::CloudEncryption,
    );

    // Encrypt
    crate::sys::security::storage::encrypt_file_with_key(&local_path, &temp_path, &key)
        .map_err(|e| crate::sys::error::Error::Other(format!("Encryption failed: {}", e)))?;

    let upload_remote_path = remote_path.clone();
    let upload_local_path = temp_path.clone(); // Upload the ENCRYPTED file

    let result = state
        .manager
        .with_client(&account_id, move |client| {
            let remote_path = upload_remote_path.clone();
            let local_path = upload_local_path.clone();
            Box::pin(async move { client.upload(&local_path, &remote_path).await })
        })
        .await;

    // Clean up temp file regardless of upload success
    if let Err(e) = std::fs::remove_file(&temp_path) {
        tracing::warn!("Failed to remove temp encrypted file {}: {}", temp_path, e);
    }

    // Handle upload result
    let result = result?;

    let _ = app.emit(
        "cloud:file_uploaded",
        &serde_json::json!({
            "accountId": account_id,
            "remotePath": remote_path,
            "localPath": local_path,
            "fileId": result
        }),
    );

    Ok(result)
}

#[tauri::command]
pub async fn cloud_download(
    request: CloudDownloadRequest,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<()> {
    let account_id = request.account_id.clone();
    let remote_path = request.remote_path.clone();
    let local_path = request.local_path.clone();

    // E2EE: Download to a temporary location
    let temp_name = format!("{}.enc", Uuid::new_v4());
    let temp_path_buf = std::env::temp_dir().join(&temp_name);
    let temp_path = temp_path_buf.to_string_lossy().to_string();

    let download_remote_path = remote_path.clone();
    let download_local_path = temp_path.clone();

    state
        .manager
        .with_client(&account_id, move |client| {
            let remote_path = download_remote_path.clone();
            let local_path = download_local_path.clone();
            Box::pin(async move { client.download(&remote_path, &local_path).await })
        })
        .await?;

    // Decrypt
    // Derive encryption key
    let key = crate::sys::security::machine_key::derive_key(
        crate::sys::security::machine_key::KeyPurpose::CloudEncryption,
    );

    let decrypt_result =
        crate::sys::security::storage::decrypt_file_with_key(&temp_path, &local_path, &key)
            .map_err(|e| crate::sys::error::Error::Other(format!("Decryption failed: {}", e)));

    // Clean up temp file
    if let Err(e) = std::fs::remove_file(&temp_path) {
        tracing::warn!("Failed to remove temp encrypted file {}: {}", temp_path, e);
    }

    // Return decryption result (or propagate error)
    decrypt_result?;

    let _ = app.emit(
        "cloud:file_downloaded",
        &serde_json::json!({
            "accountId": account_id,
            "remotePath": remote_path,
            "localPath": local_path
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn cloud_delete(
    request: CloudPathRequest,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<()> {
    let account_id = request.account_id.clone();
    let remote_path = request.remote_path.clone();

    let delete_remote_path = remote_path.clone();

    state
        .manager
        .with_client(&account_id, move |client| {
            let remote_path = delete_remote_path.clone();
            Box::pin(async move { client.delete(&remote_path).await })
        })
        .await?;

    let _ = app.emit(
        "cloud:file_deleted",
        &serde_json::json!({
            "accountId": account_id,
            "remotePath": remote_path
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn cloud_create_folder(
    request: CloudPathRequest,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<String> {
    let account_id = request.account_id.clone();
    let remote_path = request.remote_path.clone();

    let create_remote_path = remote_path.clone();

    let folder_id = state
        .manager
        .with_client(&account_id, move |client| {
            let remote_path = create_remote_path.clone();
            Box::pin(async move { client.create_folder(&remote_path).await })
        })
        .await?;

    let _ = app.emit(
        "cloud:folder_created",
        &serde_json::json!({
            "accountId": account_id,
            "remotePath": remote_path,
            "folderId": folder_id
        }),
    );

    Ok(folder_id)
}

#[tauri::command]
pub async fn cloud_share(
    request: CloudShareRequest,
    state: State<'_, CloudState>,
) -> Result<ShareLink> {
    state
        .manager
        .with_client(&request.account_id, move |client| {
            let remote = request.remote_path.clone();
            let allow_edit = request.allow_edit;
            Box::pin(async move { client.share_link(&remote, allow_edit).await })
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::cloud::CloudProvider;
    use serde_json::json;

    /// The exact objects `src/stores/cloudStore.ts` passes as `config` and
    /// `request`. Tauri hands a struct argument to serde unchanged, so these
    /// keys are the contract.
    #[test]
    fn the_requests_the_cloud_store_sends_are_read() {
        let config: CloudOAuthConfig = serde_json::from_value(json!({
            "provider": "google_drive",
            "clientId": "client-1",
            "clientSecret": "secret-1",
            "redirectUri": "http://localhost:1420/callback",
        }))
        .expect("connect config");
        assert_eq!(config.provider, CloudProvider::GoogleDrive);
        assert_eq!(config.client_id, "client-1");
        assert_eq!(config.client_secret.as_deref(), Some("secret-1"));
        assert_eq!(config.redirect_uri, "http://localhost:1420/callback");

        let list: CloudListRequest = serde_json::from_value(json!({
            "accountId": "drive-1",
            "folderPath": "/docs",
            "search": "plan",
            "includeFolders": true,
        }))
        .expect("list request");
        assert_eq!(list.account_id, "drive-1");
        assert_eq!(list.folder_path.as_deref(), Some("/docs"));
        assert_eq!(list.search.as_deref(), Some("plan"));
        assert!(list.include_folders);

        let upload: CloudUploadRequest = serde_json::from_value(json!({
            "accountId": "drive-1",
            "localPath": "/tmp/plan.md",
            "remotePath": "/docs/plan.md",
        }))
        .expect("upload request");
        assert_eq!(upload.local_path, "/tmp/plan.md");
        assert_eq!(upload.remote_path, "/docs/plan.md");

        let download: CloudDownloadRequest = serde_json::from_value(json!({
            "accountId": "drive-1",
            "remotePath": "/docs/plan.md",
            "localPath": "/tmp/plan.md",
        }))
        .expect("download request");
        assert_eq!(download.account_id, "drive-1");
        assert_eq!(download.local_path, "/tmp/plan.md");

        let path: CloudPathRequest = serde_json::from_value(json!({
            "accountId": "drive-1",
            "remotePath": "/docs/old.md",
        }))
        .expect("delete and create-folder request");
        assert_eq!(path.remote_path, "/docs/old.md");

        let share: CloudShareRequest = serde_json::from_value(json!({
            "accountId": "drive-1",
            "remotePath": "/docs/plan.md",
            "allowEdit": true,
        }))
        .expect("share request");
        assert_eq!(share.remote_path, "/docs/plan.md");
        assert!(share.allow_edit);

        let complete: CloudCompleteOAuthRequest =
            serde_json::from_value(json!({ "state": "s-1", "code": "c-1" }))
                .expect("complete request");
        assert_eq!(
            (complete.state.as_str(), complete.code.as_str()),
            ("s-1", "c-1")
        );
    }

    /// The store reads these replies by their snake_case names.
    #[test]
    fn the_replies_keep_the_names_the_cloud_store_reads() {
        let started = serde_json::to_value(CloudAuthorizationResponse {
            auth_url: "https://accounts.example/authorize".to_string(),
            state: "s-1".to_string(),
        })
        .expect("authorization reply");
        assert_eq!(started["auth_url"], "https://accounts.example/authorize");

        let account = serde_json::to_value(CloudAccount {
            account_id: "drive-1".to_string(),
            provider: CloudProvider::GoogleDrive,
            label: None,
        })
        .expect("account");
        assert_eq!(account["account_id"], "drive-1");
        assert_eq!(account["provider"], "google_drive");

        let link = serde_json::to_value(ShareLink {
            url: "https://share.example/1".to_string(),
            expires_at: None,
            scope: None,
            allow_edit: true,
        })
        .expect("share link");
        assert_eq!(link["allow_edit"], true);
    }
}
