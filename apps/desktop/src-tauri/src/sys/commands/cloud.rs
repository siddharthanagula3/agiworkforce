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
pub struct CloudListRequest {
    pub account_id: String,
    pub folder_path: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub include_folders: bool,
}

#[derive(Debug, serde::Deserialize)]
pub struct CloudPathRequest {
    pub account_id: String,
    pub remote_path: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct CloudUploadRequest {
    pub account_id: String,
    pub local_path: String,
    pub remote_path: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct CloudDownloadRequest {
    pub account_id: String,
    pub remote_path: String,
    pub local_path: String,
}

#[derive(Debug, serde::Deserialize)]
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
pub async fn cloud_disconnect(
    account_id: String,
    state: State<'_, CloudState>,
    app: AppHandle,
) -> Result<()> {
    tracing::info!("Disconnecting cloud account {}", account_id);

    state.manager.disconnect(&account_id)?;
    let _ = app.emit("cloud:disconnected", &account_id);
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
