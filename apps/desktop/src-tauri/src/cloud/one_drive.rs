use crate::{
    api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse},
    cloud::{CloudFile, ListOptions, ShareLink},
    error::{Error, Result},
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

const MICROSOFT_AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE_URL: &str = "https://graph.microsoft.com/v1.0";
const UPLOAD_CHUNK_SIZE: usize = 8 * 1024 * 1024; // 8 MB

#[derive(Clone)]
pub struct OneDriveClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl OneDriveClient {
    // Updated Nov 16, 2025: Return Result instead of panicking on HTTP client construction failure
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Result<Self> {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: MICROSOFT_AUTH_URL.to_string(),
            token_url: MICROSOFT_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![
                "offline_access".to_string(),
                "Files.ReadWrite.All".to_string(),
            ],
            use_pkce: true,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| Error::Other(format!("Failed to construct HTTP client for OneDrive: {}", e)))?;

        Ok(Self {
            client,
            oauth_client: OAuth2Client::new(oauth_config)?,
            token: None,
        })
    }

    pub fn get_authorization_url(&self, state: &str) -> (String, Option<PkceChallenge>) {
        let pkce = PkceChallenge::generate();
        let url = self.oauth_client.get_authorization_url(state, Some(&pkce));
        (url, Some(pkce))
    }

    pub async fn authorize_with_code(&mut self, code: &str, verifier: Option<&str>) -> Result<()> {
        let token = self
            .oauth_client
            .exchange_code(code, verifier)
            .await
            .map_err(|e| Error::Other(format!("OneDrive OAuth exchange failed: {}", e)))?;
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
                Error::Other("Microsoft refresh token missing; re-authenticate".to_string())
            })?;

        let refreshed = self
            .oauth_client
            .refresh_token(&refresh)
            .await
            .map_err(|e| Error::Other(format!("Failed to refresh OneDrive token: {}", e)))?;
        self.token = Some(refreshed.clone());
        Ok(refreshed.access_token)
    }

    pub async fn list(&mut self, options: ListOptions) -> Result<Vec<CloudFile>> {
        let token = self.ensure_token().await?;
        let path = options.folder_path.unwrap_or_else(|| "/".to_string());
        let endpoint = if let Some(id) = path.strip_prefix("id:") {
            format!("{GRAPH_BASE_URL}/me/drive/items/{id}/children", id = id)
        } else {
            format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}:/children",
                self.normalize_path(&path)
            )
        };

        let mut url = endpoint;
        let mut files = Vec::new();

        loop {
            let response = self
                .client
                .get(&url)
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|e| Error::Other(format!("OneDrive list request failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "OneDrive list failed: {} - {}",
                    status, body
                )));
            }

            let payload: DriveItemsResponse = response.json().await.map_err(|e| {
                Error::Other(format!("Failed to parse OneDrive list response: {}", e))
            })?;

            for item in payload.value {
                if item.is_folder() && !options.include_folders {
                    continue;
                }

                if let Some(search_term) = options.search.as_ref() {
                    if !item
                        .name
                        .to_lowercase()
                        .contains(&search_term.to_lowercase())
                    {
                        continue;
                    }
                }

                files.push(item.into_cloud_file());
            }

            if let Some(next) = payload.next_link {
                url = next;
            } else {
                break;
            }
        }

        Ok(files)
    }

    pub async fn upload(&mut self, local_path: &str, remote_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let metadata = tokio::fs::metadata(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to stat local file: {}", e)))?;
        let total_size = metadata.len();
        let normalized_path = self.normalize_path(remote_path);

        if total_size <= 4 * 1024 * 1024 {
            return self
                .simple_upload(&token, local_path, &normalized_path)
                .await;
        }

        self.resumable_upload(&token, local_path, &normalized_path, total_size)
            .await
    }

    pub async fn download(&mut self, remote_path: &str, local_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let endpoint = if let Some(id) = remote_path.strip_prefix("id:") {
            format!("{GRAPH_BASE_URL}/me/drive/items/{id}/content", id = id)
        } else {
            format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}:/content",
                self.normalize_path(remote_path)
            )
        };

        let response = self
            .client
            .get(endpoint)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive download request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "OneDrive download failed: {} - {}",
                status, body
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Other(format!("Failed to read OneDrive download: {}", e)))?;
        tokio::fs::write(local_path, bytes)
            .await
            .map_err(|e| Error::Other(format!("Failed to write file: {}", e)))?;
        Ok(())
    }

    pub async fn delete(&mut self, remote_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let endpoint = if let Some(id) = remote_path.strip_prefix("id:") {
            format!("{GRAPH_BASE_URL}/me/drive/items/{id}", id = id)
        } else {
            format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}",
                self.normalize_path(remote_path)
            )
        };

        let response = self
            .client
            .delete(endpoint)
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive delete request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "OneDrive delete failed: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    pub async fn create_folder(&mut self, folder_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let normalized = self.normalize_path(folder_path);
        if normalized == "/" {
            return Ok("root".to_string());
        }

        let (parent_path, folder_name) = if let Some((parent, name)) = normalized.rsplit_once('/') {
            let parent = if parent.is_empty() { "/" } else { parent };
            (parent.to_string(), name.to_string())
        } else {
            (
                "/".to_string(),
                normalized.trim_start_matches('/').to_string(),
            )
        };

        let endpoint = if let Some(id) = parent_path.strip_prefix("id:") {
            format!("{GRAPH_BASE_URL}/me/drive/items/{id}/children", id = id)
        } else {
            format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}:/children",
                self.normalize_path(&parent_path)
            )
        };

        let response = self
            .client
            .post(endpoint)
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "name": folder_name,
                "folder": {},
                "@microsoft.graph.conflictBehavior": "fail"
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive create folder failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "OneDrive create folder failed: {} - {}",
                status, body
            )));
        }

        let payload: DriveItem = response.json().await.map_err(|e| {
            Error::Other(format!("Failed to parse folder creation response: {}", e))
        })?;

        Ok(payload.id)
    }

    pub async fn share_link(&mut self, remote_path: &str, allow_edit: bool) -> Result<ShareLink> {
        let token = self.ensure_token().await?;
        let endpoint = if let Some(id) = remote_path.strip_prefix("id:") {
            format!("{GRAPH_BASE_URL}/me/drive/items/{id}/createLink", id = id)
        } else {
            format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}:/createLink",
                self.normalize_path(remote_path)
            )
        };

        let link_type = if allow_edit { "edit" } else { "view" };
        let response = self
            .client
            .post(endpoint)
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "type": link_type,
                "scope": "anonymous"
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive share request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "OneDrive share failed: {} - {}",
                status, body
            )));
        }

        let payload: ShareLinkResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse OneDrive share response: {}", e)))?;

        let link = payload.link.ok_or_else(|| {
            Error::Other("OneDrive response missing link information".to_string())
        })?;

        Ok(ShareLink {
            url: link.web_url,
            expires_at: link.expiration_date_time,
            scope: link.scope,
            allow_edit,
        })
    }

    pub async fn get_account_display_name(&self) -> Result<Option<String>> {
        let Some(token) = &self.token else {
            return Ok(None);
        };

        let response = self
            .client
            .get(format!("{GRAPH_BASE_URL}/me"))
            .bearer_auth(&token.access_token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive account lookup failed: {}", e)))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let payload: UserProfile = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse account profile: {}", e)))?;

        Ok(Some(payload.display_name))
    }

    async fn simple_upload(
        &self,
        token: &str,
        local_path: &str,
        remote_path: &str,
    ) -> Result<String> {
        let bytes = tokio::fs::read(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to read local file: {}", e)))?;

        let endpoint = format!("{GRAPH_BASE_URL}/me/drive/root:{}:/content", remote_path);

        let response = self
            .client
            .put(endpoint)
            .bearer_auth(token)
            .header("Content-Type", "application/octet-stream")
            .body(bytes)
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive upload failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "OneDrive upload failed: {} - {}",
                status, body
            )));
        }

        let payload: DriveItem = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse upload response: {}", e)))?;

        Ok(payload.id)
    }

    async fn resumable_upload(
        &self,
        token: &str,
        local_path: &str,
        remote_path: &str,
        total_size: u64,
    ) -> Result<String> {
        let session = self
            .client
            .post(format!(
                "{GRAPH_BASE_URL}/me/drive/root:{}:/createUploadSession",
                remote_path
            ))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "item": {
                    "@microsoft.graph.conflictBehavior": "replace"
                }
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("OneDrive create upload session failed: {}", e)))?;

        if !session.status().is_success() {
            let status = session.status();
            let body = session
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Create upload session failed: {} - {}",
                status, body
            )));
        }

        let upload_session: UploadSession = session
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse upload session: {}", e)))?;
        let upload_url = upload_session
            .upload_url
            .ok_or_else(|| Error::Other("Upload session missing uploadUrl".to_string()))?;

        let mut file = File::open(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to open local file: {}", e)))?;
        let mut buffer = vec![0u8; UPLOAD_CHUNK_SIZE];
        let mut offset: u64 = 0;

        while offset < total_size {
            let read = file
                .read(&mut buffer)
                .await
                .map_err(|e| Error::Other(format!("Failed to read upload chunk: {}", e)))?;
            if read == 0 {
                break;
            }

            let end = offset + read as u64 - 1;
            let range = format!("bytes {}-{}/{}", offset, end, total_size);

            let response = self
                .client
                .put(upload_url.clone())
                .header("Content-Length", read)
                .header("Content-Range", range)
                .body(buffer[..read].to_vec())
                .send()
                .await
                .map_err(|e| Error::Other(format!("OneDrive chunk upload failed: {}", e)))?;

            if !(response.status().is_success() || response.status() == 202) {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "OneDrive chunk upload failed: {} - {}",
                    status, body
                )));
            }

            offset += read as u64;

            if response.status().is_success() && offset >= total_size {
                let payload: DriveItem = response.json().await.map_err(|e| {
                    Error::Other(format!("Failed to parse final upload response: {}", e))
                })?;
                return Ok(payload.id);
            }
        }

        Err(Error::Other(
            "Upload session did not return completion response".to_string(),
        ))
    }

    fn normalize_path(&self, path: &str) -> String {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            "/".to_string()
        } else if trimmed.starts_with('/') {
            trimmed.to_string()
        } else {
            format!("/{}", trimmed)
        }
    }
}

#[derive(Debug, Deserialize)]
struct DriveItemsResponse {
    value: Vec<DriveItem>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveItem {
    id: String,
    name: String,
    #[serde(rename = "size")]
    size: Option<u64>,
    #[serde(rename = "lastModifiedDateTime")]
    last_modified: Option<DateTime<Utc>>,
    #[serde(rename = "webUrl")]
    web_url: Option<String>,
    #[serde(rename = "folder")]
    folder: Option<DriveFolder>,
    #[serde(rename = "file")]
    file: Option<DriveFileInfo>,
    #[serde(rename = "parentReference")]
    parent_reference: Option<ParentReference>,
}

impl DriveItem {
    fn is_folder(&self) -> bool {
        self.folder.is_some()
    }

    fn into_cloud_file(self) -> CloudFile {
        let DriveItem {
            id,
            name,
            size,
            last_modified,
            web_url,
            folder,
            file,
            parent_reference,
        } = self;

        let path = parent_reference
            .and_then(|ref_data| ref_data.path)
            .unwrap_or_else(|| "/drive/root".to_string());
        let friendly_path = path.trim_start_matches("/drive/root");
        let full_path = if friendly_path.is_empty() {
            format!("/{}", name)
        } else {
            format!("{}/{}", friendly_path, name)
        };
        let is_folder = folder.is_some();

        CloudFile {
            id,
            name,
            path: full_path,
            mime_type: file.and_then(|info| info.mime_type),
            size,
            modified_at: last_modified.map(|dt| dt.to_rfc3339()),
            is_folder,
            share_link: web_url,
        }
    }
}

#[derive(Debug, Deserialize)]
struct DriveFolder {
    #[serde(rename = "childCount")]
    _child_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct DriveFileInfo {
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ParentReference {
    #[serde(rename = "path")]
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UploadSession {
    #[serde(rename = "uploadUrl")]
    upload_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ShareLinkResponse {
    link: Option<ShareLinkInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareLinkInfo {
    web_url: String,
    scope: Option<String>,
    expiration_date_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserProfile {
    display_name: String,
}
