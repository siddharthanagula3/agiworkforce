use crate::{
    api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse},
    cloud::{CloudFile, ListOptions, ShareLink},
    error::{Error, Result},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::fs::File;
use tokio::io::AsyncReadExt;

const DROPBOX_AUTH_URL: &str = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL: &str = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API_URL: &str = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_URL: &str = "https://content.dropboxapi.com/2";

const UPLOAD_CHUNK_SIZE: usize = 8 * 1024 * 1024; // 8 MB

#[derive(Clone)]
pub struct DropboxClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl DropboxClient {
    // Updated Nov 16, 2025: Return Result instead of panicking on HTTP client construction failure
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Result<Self> {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: DROPBOX_AUTH_URL.to_string(),
            token_url: DROPBOX_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![],
            use_pkce: false,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to construct HTTP client for Dropbox: {}",
                    e
                ))
            })?;

        Ok(Self {
            client,
            oauth_client: OAuth2Client::new(oauth_config)?,
            token: None,
        })
    }

    pub fn get_authorization_url(&self, state: &str) -> (String, Option<PkceChallenge>) {
        let url = self.oauth_client.get_authorization_url(state, None);
        (url, None)
    }

    pub async fn authorize_with_code(&mut self, code: &str) -> Result<()> {
        let token = self
            .oauth_client
            .exchange_code(code, None)
            .await
            .map_err(|e| Error::Other(format!("Dropbox OAuth exchange failed: {}", e)))?;
        self.token = Some(token);
        Ok(())
    }

    async fn ensure_token(&mut self) -> Result<String> {
        if let Some(token) = &self.token {
            if !token.is_expired() {
                return Ok(token.access_token.clone());
            }
        }

        let refresh = self
            .token
            .as_ref()
            .and_then(|token| token.refresh_token.clone())
            .ok_or_else(|| {
                Error::Other("Dropbox refresh token missing; re-authenticate".to_string())
            })?;

        let refreshed = self
            .oauth_client
            .refresh_token(&refresh)
            .await
            .map_err(|e| Error::Other(format!("Failed to refresh Dropbox token: {}", e)))?;
        self.token = Some(refreshed.clone());
        Ok(refreshed.access_token)
    }

    pub async fn list(&mut self, options: ListOptions) -> Result<Vec<CloudFile>> {
        let token = self.ensure_token().await?;
        let mut entries = Vec::new();
        let path = options.folder_path.unwrap_or_default();
        let mut has_more = true;
        let mut cursor: Option<String> = None;

        while has_more {
            let response = if let Some(cursor_value) = &cursor {
                self.client
                    .post(format!("{DROPBOX_API_URL}/files/list_folder/continue"))
                    .bearer_auth(&token)
                    .json(&serde_json::json!({ "cursor": cursor_value }))
                    .send()
                    .await
            } else {
                self.client
                    .post(format!("{DROPBOX_API_URL}/files/list_folder"))
                    .bearer_auth(&token)
                    .json(&serde_json::json!({
                        "path": path,
                        "recursive": false,
                        "limit": 2000,
                        "include_media_info": false,
                        "include_deleted": false
                    }))
                    .send()
                    .await
            }
            .map_err(|e| Error::Other(format!("Dropbox list operation failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "Dropbox list failed: {} - {}",
                    status, body
                )));
            }

            let payload: ListFolderResult = response.json().await.map_err(|e| {
                Error::Other(format!("Failed to parse Dropbox list response: {}", e))
            })?;

            for entry in payload.entries {
                if entry.is_folder() && !options.include_folders {
                    continue;
                }

                if let Some(search_term) = options.search.as_ref() {
                    let name = entry.display_name();
                    if !name.to_lowercase().contains(&search_term.to_lowercase()) {
                        continue;
                    }
                }

                entries.push(entry.into_cloud_file());
            }

            has_more = payload.has_more;
            cursor = payload.cursor;
        }

        Ok(entries)
    }

    pub async fn upload(&mut self, local_path: &str, remote_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let metadata = tokio::fs::metadata(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to stat local file: {}", e)))?;
        let total_size = metadata.len();
        let path_lower = self.normalize_path(remote_path);

        if total_size == 0 {
            let response = self
                .client
                .post(format!("{DROPBOX_CONTENT_URL}/files/upload"))
                .bearer_auth(&token)
                .header("Content-Type", "application/octet-stream")
                .header(
                    "Dropbox-API-Arg",
                    serde_json::json!({
                        "path": path_lower,
                        "mode": { ".tag": "overwrite" },
                        "autorename": false,
                        "mute": false,
                        "strict_conflict": false
                    })
                    .to_string(),
                )
                .body(Vec::new())
                .send()
                .await
                .map_err(|e| Error::Other(format!("Dropbox zero-byte upload failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "Dropbox upload failed: {} - {}",
                    status, body
                )));
            }

            let metadata: FileMetadata = response
                .json()
                .await
                .map_err(|e| Error::Other(format!("Failed to parse upload result: {}", e)))?;
            return Ok(metadata.id);
        }

        let mut file = File::open(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to open file for upload: {}", e)))?;
        let mut buffer = vec![0u8; UPLOAD_CHUNK_SIZE];
        let mut offset: u64 = 0;
        let mut session_id: Option<String> = None;

        while offset < total_size {
            let read = file
                .read(&mut buffer)
                .await
                .map_err(|e| Error::Other(format!("Failed to read upload chunk: {}", e)))?;
            if read == 0 {
                break;
            }

            let chunk = &buffer[..read];
            if session_id.is_none() {
                let response = self
                    .client
                    .post(format!("{DROPBOX_CONTENT_URL}/files/upload_session/start"))
                    .bearer_auth(&token)
                    .header("Content-Type", "application/octet-stream")
                    .header("Dropbox-API-Arg", "{\"close\": false}")
                    .body(chunk.to_vec())
                    .send()
                    .await
                    .map_err(|e| {
                        Error::Other(format!("Dropbox upload session start failed: {}", e))
                    })?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Unable to read response body".to_string());
                    return Err(Error::Other(format!(
                        "Failed to start Dropbox upload session: {} - {}",
                        status, body
                    )));
                }

                let payload: UploadSessionStart = response.json().await.map_err(|e| {
                    Error::Other(format!("Failed to parse upload session response: {}", e))
                })?;
                session_id = Some(payload.session_id);
            } else {
                // Updated Nov 16, 2025: Use proper error handling instead of unwrap
                let current_session_id = session_id.as_ref().ok_or_else(|| {
                    Error::Other("Upload session ID is missing during append operation".to_string())
                })?;
                let cursor_payload = serde_json::json!({
                    "cursor": {
                        "session_id": current_session_id,
                        "offset": offset
                    },
                    "close": false
                });

                let response = self
                    .client
                    .post(format!(
                        "{DROPBOX_CONTENT_URL}/files/upload_session/append_v2"
                    ))
                    .bearer_auth(&token)
                    .header("Content-Type", "application/octet-stream")
                    .header("Dropbox-API-Arg", cursor_payload.to_string())
                    .body(chunk.to_vec())
                    .send()
                    .await
                    .map_err(|e| Error::Other(format!("Dropbox upload append failed: {}", e)))?;

                if !response.status().is_success() {
                    let status = response.status();
                    let body = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Unable to read response body".to_string());
                    return Err(Error::Other(format!(
                        "Dropbox append failed: {} - {}",
                        status, body
                    )));
                }
            }

            offset += read as u64;
        }

        let session_id =
            session_id.ok_or_else(|| Error::Other("Upload session not initialized".to_string()))?;
        let commit_info = serde_json::json!({
            "cursor": {
                "session_id": session_id,
                "offset": total_size
            },
            "commit": {
                "path": path_lower,
                "mode": { ".tag": "overwrite" },
                "mute": false,
                "autorename": false
            }
        });

        let response = self
            .client
            .post(format!("{DROPBOX_CONTENT_URL}/files/upload_session/finish"))
            .bearer_auth(&token)
            .header("Content-Type", "application/octet-stream")
            .header("Dropbox-API-Arg", commit_info.to_string())
            .body(Vec::new())
            .send()
            .await
            .map_err(|e| Error::Other(format!("Dropbox upload finish failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Dropbox upload failed: {} - {}",
                status, body
            )));
        }

        let metadata: FileMetadata = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse upload result: {}", e)))?;

        Ok(metadata.id)
    }

    pub async fn download(&mut self, remote_path: &str, local_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let arg = serde_json::json!({ "path": self.normalize_path(remote_path) }).to_string();

        let response = self
            .client
            .post(format!("{DROPBOX_CONTENT_URL}/files/download"))
            .bearer_auth(&token)
            .header("Dropbox-API-Arg", arg)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Dropbox download request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Dropbox download failed: {} - {}",
                status, body
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Other(format!("Failed to read Dropbox download: {}", e)))?;
        tokio::fs::write(local_path, bytes)
            .await
            .map_err(|e| Error::Other(format!("Failed to write downloaded file: {}", e)))?;

        Ok(())
    }

    pub async fn delete(&mut self, remote_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let response = self
            .client
            .post(format!("{DROPBOX_API_URL}/files/delete_v2"))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "path": self.normalize_path(remote_path) }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Dropbox delete request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Dropbox delete failed: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    pub async fn create_folder(&mut self, folder_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let response = self
            .client
            .post(format!("{DROPBOX_API_URL}/files/create_folder_v2"))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "path": self.normalize_path(folder_path),
                "autorename": false
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Dropbox create folder failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Dropbox create folder failed: {} - {}",
                status, body
            )));
        }

        let payload: FolderCreateResult = response.json().await.map_err(|e| {
            Error::Other(format!("Failed to parse folder creation response: {}", e))
        })?;

        Ok(payload.metadata.id)
    }

    pub async fn share_link(&mut self, remote_path: &str, allow_edit: bool) -> Result<ShareLink> {
        let token = self.ensure_token().await?;
        let settings = if allow_edit {
            serde_json::json!({
                "requested_visibility": "public",
                "audience": "public",
                "access": "editor"
            })
        } else {
            serde_json::json!({
                "requested_visibility": "public",
                "audience": "public",
                "access": "viewer"
            })
        };

        let response = self
            .client
            .post(format!(
                "{DROPBOX_API_URL}/sharing/create_shared_link_with_settings"
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "path": self.normalize_path(remote_path),
                "settings": settings
            }))
            .send()
            .await;

        let response = match response {
            Ok(resp) if resp.status().is_success() => resp,
            Ok(resp) => {
                // If link already exists, fallback to listing existing links
                let status = resp.status();
                let body = resp
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());

                if status.as_u16() == 409 && body.contains("shared_link_already_exists") {
                    return self
                        .fetch_existing_shared_link(&token, remote_path, allow_edit)
                        .await;
                }

                return Err(Error::Other(format!(
                    "Dropbox share failed: {} - {}",
                    status, body
                )));
            }
            Err(err) => {
                return Err(Error::Other(format!(
                    "Dropbox share request failed: {}",
                    err
                )))
            }
        };

        let payload: SharedLinkMetadata = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse shared link response: {}", e)))?;

        Ok(ShareLink {
            url: payload.url,
            expires_at: payload.expires,
            scope: Some("public".to_string()),
            allow_edit,
        })
    }

    pub async fn get_account_name(&self) -> Result<Option<String>> {
        let Some(token) = &self.token else {
            return Ok(None);
        };

        let response = self
            .client
            .post(format!("{DROPBOX_API_URL}/users/get_current_account"))
            .bearer_auth(&token.access_token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Dropbox account lookup failed: {}", e)))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let payload: CurrentAccount = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse account lookup: {}", e)))?;

        Ok(Some(payload.name.display_name))
    }

    async fn fetch_existing_shared_link(
        &self,
        token: &str,
        remote_path: &str,
        allow_edit: bool,
    ) -> Result<ShareLink> {
        let response = self
            .client
            .post(format!("{DROPBOX_API_URL}/sharing/list_shared_links"))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "path": self.normalize_path(remote_path),
                "direct_only": true
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to list shared links: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "List shared links failed: {} - {}",
                status, body
            )));
        }

        let payload: SharedLinksList = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse shared links response: {}", e)))?;

        if let Some(link) = payload.links.into_iter().next() {
            return Ok(ShareLink {
                url: link.url,
                expires_at: link.expires,
                scope: Some(link.visibility.tag),
                allow_edit,
            });
        }

        Err(Error::Other(
            "Dropbox did not return an existing shared link".to_string(),
        ))
    }

    fn normalize_path(&self, path: &str) -> String {
        let trimmed = path.trim();
        if trimmed.is_empty() || trimmed == "/" {
            "".to_string()
        } else if trimmed.starts_with('/') {
            trimmed.to_string()
        } else {
            format!("/{}", trimmed)
        }
    }
}

#[derive(Debug, Deserialize)]
struct ListFolderResult {
    entries: Vec<Metadata>,
    #[serde(default)]
    cursor: Option<String>,
    has_more: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = ".tag", rename_all = "snake_case")]
enum Metadata {
    File(FileMetadata),
    Folder(FolderMetadata),
    Deleted,
}

impl Metadata {
    fn is_folder(&self) -> bool {
        matches!(self, Metadata::Folder(_))
    }

    fn display_name(&self) -> &str {
        match self {
            Metadata::File(file) => &file.name,
            Metadata::Folder(folder) => &folder.name,
            Metadata::Deleted => "",
        }
    }

    fn into_cloud_file(self) -> CloudFile {
        match self {
            Metadata::File(file) => CloudFile {
                id: file.id,
                name: file.name,
                path: file.path_display.unwrap_or_else(|| file.path_lower.clone()),
                mime_type: file.content_type,
                size: Some(file.size),
                modified_at: file.client_modified,
                is_folder: false,
                share_link: None,
            },
            Metadata::Folder(folder) => CloudFile {
                id: folder.id,
                name: folder.name,
                path: folder
                    .path_display
                    .unwrap_or_else(|| folder.path_lower.clone()),
                mime_type: Some("application/vnd.dropbox.folder".to_string()),
                size: None,
                modified_at: None,
                is_folder: true,
                share_link: None,
            },
            Metadata::Deleted => CloudFile {
                id: "".to_string(),
                name: "".to_string(),
                path: "".to_string(),
                mime_type: None,
                size: None,
                modified_at: None,
                is_folder: false,
                share_link: None,
            },
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct FileMetadata {
    id: String,
    name: String,
    #[serde(rename = "path_lower")]
    path_lower: String,
    #[serde(rename = "path_display")]
    path_display: Option<String>,
    #[serde(rename = "client_modified")]
    client_modified: Option<String>,
    #[serde(rename = "content_type")]
    content_type: Option<String>,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct FolderMetadata {
    id: String,
    name: String,
    #[serde(rename = "path_lower")]
    path_lower: String,
    #[serde(rename = "path_display")]
    path_display: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UploadSessionStart {
    #[serde(rename = "session_id")]
    session_id: String,
}

#[derive(Debug, Deserialize)]
struct FolderCreateResult {
    metadata: FolderMetadata,
}

#[derive(Debug, Deserialize)]
struct SharedLinkMetadata {
    url: String,
    expires: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SharedLinksList {
    links: Vec<SharedLinkInfo>,
}

#[derive(Debug, Deserialize)]
struct SharedLinkInfo {
    url: String,
    expires: Option<String>,
    visibility: SharedLinkVisibility,
}

#[derive(Debug, Deserialize)]
struct SharedLinkVisibility {
    #[serde(rename = ".tag")]
    tag: String,
}

#[derive(Debug, Deserialize)]
struct CurrentAccount {
    name: CurrentAccountName,
}

#[derive(Debug, Deserialize)]
struct CurrentAccountName {
    #[serde(rename = "display_name")]
    display_name: String,
}
