use std::path::Path;

use crate::{
    api::oauth::{OAuth2Client, OAuth2Config, PkceChallenge, TokenResponse},
    cloud::{CloudFile, ListOptions, ShareLink},
    error::{Error, Result},
};
use chrono::{DateTime, Utc};
use mime_guess::MimeGuess;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::fs::File;
use tokio::io::AsyncReadExt;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DRIVE_BASE_URL: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_SCOPE_METADATA: &str = "https://www.googleapis.com/auth/drive.metadata.readonly";
const DRIVE_SCOPE_FILE: &str = "https://www.googleapis.com/auth/drive.file";
const DRIVE_SCOPE_ALL: &str = "https://www.googleapis.com/auth/drive";

const UPLOAD_CHUNK_SIZE: usize = 10 * 1024 * 1024; // 10 MB

#[derive(Clone)]
pub struct GoogleDriveClient {
    client: Client,
    oauth_client: OAuth2Client,
    token: Option<TokenResponse>,
}

impl GoogleDriveClient {
    // Updated Nov 16, 2025: Return Result instead of panicking on HTTP client construction failure
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Result<Self> {
        let oauth_config = OAuth2Config {
            client_id,
            client_secret: Some(client_secret),
            auth_url: GOOGLE_AUTH_URL.to_string(),
            token_url: GOOGLE_TOKEN_URL.to_string(),
            redirect_uri,
            scopes: vec![
                DRIVE_SCOPE_METADATA.to_string(),
                DRIVE_SCOPE_FILE.to_string(),
                DRIVE_SCOPE_ALL.to_string(),
            ],
            use_pkce: true,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to construct HTTP client for Google Drive: {}",
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
        let pkce = PkceChallenge::generate();
        let url = self.oauth_client.get_authorization_url(state, Some(&pkce));
        (url, Some(pkce))
    }

    pub async fn authorize_with_code(&mut self, code: &str, verifier: Option<&str>) -> Result<()> {
        let token = self
            .oauth_client
            .exchange_code(code, verifier)
            .await
            .map_err(|e| Error::Other(format!("Failed to exchange authorization code: {}", e)))?;
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
                Error::Other("Missing refresh token; re-authentication required".to_string())
            })?;

        let refreshed = self
            .oauth_client
            .refresh_token(&refresh)
            .await
            .map_err(|e| Error::Other(format!("Failed to refresh Google Drive token: {}", e)))?;
        self.token = Some(refreshed.clone());
        Ok(refreshed.access_token)
    }

    pub async fn list(&mut self, options: ListOptions) -> Result<Vec<CloudFile>> {
        let token = self.ensure_token().await?;
        let folder_path = options.folder_path.unwrap_or_else(|| "/".to_string());
        let folder_id = self.resolve_folder_id(&token, &folder_path, false).await?;
        let mut results = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut req = self
                .client
                .get(format!("{DRIVE_BASE_URL}/files"))
                .bearer_auth(&token)
                .query(&[
                    ("q", self.build_list_query(&folder_id, options.search.as_deref()).as_str()),
                    (
                        "fields",
                        "files(id,name,mimeType,modifiedTime,size,webViewLink,parents),nextPageToken",
                    ),
                    ("spaces", "drive"),
                    ("pageSize", "200"),
                    ("supportsAllDrives", "false"),
                    ("includeItemsFromAllDrives", "false"),
                ]);

            if let Some(page) = &page_token {
                req = req.query(&[("pageToken", page.as_str())]);
            }

            let response = req
                .send()
                .await
                .map_err(|e| Error::Other(format!("Google Drive list request failed: {}", e)))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "Google Drive list request failed: {} - {}",
                    status, body
                )));
            }

            let payload: DriveListResponse = response.json().await.map_err(|e| {
                Error::Other(format!("Failed to parse Google Drive list response: {}", e))
            })?;

            for item in payload.files {
                if !options.include_folders && item.is_folder() {
                    continue;
                }

                results.push(CloudFile {
                    id: item.id.clone(),
                    name: item.name.clone(),
                    path: item.full_path(&folder_path),
                    mime_type: item.mime_type.clone(),
                    size: item.size.as_ref().and_then(|s| s.parse::<u64>().ok()),
                    modified_at: item.modified_time.as_ref().map(|value| value.to_string()),
                    is_folder: item.is_folder(),
                    share_link: item.web_view_link.clone(),
                });
            }

            if let Some(next_page) = payload.next_page_token {
                page_token = Some(next_page);
            } else {
                break;
            }
        }

        Ok(results)
    }

    pub async fn upload(&mut self, local_path: &str, remote_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let path = Path::new(local_path);
        if !path.exists() {
            return Err(Error::Other(format!(
                "Local file not found: {}",
                local_path
            )));
        }

        let sanitized = remote_path.trim().trim_end_matches('/');
        if sanitized.is_empty() {
            return Err(Error::Other(
                "Remote path must include a file name".to_string(),
            ));
        }

        let (parent_path, file_name) = if let Some((parent, name)) = sanitized.rsplit_once('/') {
            let parent_norm = if parent.is_empty() { "/" } else { parent };
            (parent_norm.to_string(), name.to_string())
        } else {
            ("/".to_string(), sanitized.to_string())
        };

        let parent_id = self.resolve_folder_id(&token, &parent_path, true).await?;

        let metadata = tokio::fs::metadata(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to read file metadata: {}", e)))?;
        let total_size = metadata.len();
        let mime_type = MimeGuess::from_path(path)
            .first_raw()
            .unwrap_or("application/octet-stream")
            .to_string();

        let upload_url = self
            .initiate_resumable_upload(&token, &file_name, &parent_id, &mime_type, total_size)
            .await?;

        let mut file = File::open(local_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to open file for upload: {}", e)))?;
        let mut buffer = vec![0u8; UPLOAD_CHUNK_SIZE];
        let mut offset: u64 = 0;

        loop {
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
                .put(&upload_url)
                .bearer_auth(&token)
                .header("Content-Length", read)
                .header("Content-Range", range)
                .body(buffer[..read].to_vec())
                .send()
                .await
                .map_err(|e| Error::Other(format!("Google Drive chunk upload failed: {}", e)))?;

            if !(response.status().is_success() || response.status() == 308) {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unable to read response body".to_string());
                return Err(Error::Other(format!(
                    "Google Drive upload failed: {} - {}",
                    status, body
                )));
            }

            offset += read as u64;
        }

        // Fetch the uploaded file metadata to return its ID
        let uploaded = self
            .find_in_parent(&token, &parent_id, &file_name)
            .await?
            .ok_or_else(|| Error::Other("Uploaded file not located via Drive API".to_string()))?;

        Ok(uploaded.id)
    }

    pub async fn download(&mut self, remote_path: &str, local_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let item = self.resolve_item(&token, remote_path).await?;

        let response = self
            .client
            .get(format!("{DRIVE_BASE_URL}/files/{id}", id = item.id))
            .query(&[("alt", "media")])
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive download request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive download failed: {} - {}",
                status, body
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Other(format!("Failed to read download response: {}", e)))?;
        tokio::fs::write(local_path, bytes)
            .await
            .map_err(|e| Error::Other(format!("Failed to write downloaded file: {}", e)))?;

        Ok(())
    }

    pub async fn delete(&mut self, remote_path: &str) -> Result<()> {
        let token = self.ensure_token().await?;
        let item = self.resolve_item(&token, remote_path).await?;

        let response = self
            .client
            .delete(format!("{DRIVE_BASE_URL}/files/{id}", id = item.id))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive delete request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive delete failed: {} - {}",
                status, body
            )));
        }

        Ok(())
    }

    pub async fn create_folder(&mut self, folder_path: &str) -> Result<String> {
        let token = self.ensure_token().await?;
        let normalized = folder_path.trim();
        if normalized.is_empty() || normalized == "/" {
            return Ok("root".to_string());
        }

        self.resolve_folder_id(&token, normalized, true).await
    }

    pub async fn share_link(&mut self, remote_path: &str, allow_edit: bool) -> Result<ShareLink> {
        let token = self.ensure_token().await?;
        let item = self.resolve_item(&token, remote_path).await?;
        let role = if allow_edit { "writer" } else { "reader" };

        let response = self
            .client
            .post(format!(
                "{DRIVE_BASE_URL}/files/{id}/permissions",
                id = item.id
            ))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "role": role,
                "type": "anyone",
                "allowFileDiscovery": false
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive share request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive share failed: {} - {}",
                status, body
            )));
        }

        // Fetch the latest metadata set to get share links
        let metadata = self
            .client
            .get(format!("{DRIVE_BASE_URL}/files/{id}", id = item.id))
            .query(&[("fields", "webViewLink,webContentLink,modifiedTime")])
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to fetch shared file metadata: {}", e)))?;

        if !metadata.status().is_success() {
            let status = metadata.status();
            let body = metadata
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive metadata retrieval failed: {} - {}",
                status, body
            )));
        }

        let payload: ShareMetadata = metadata
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse share metadata: {}", e)))?;

        tracing::debug!(
            "Google Drive share metadata for {} modified_at={:?}",
            item.id,
            payload.modified_time
        );

        Ok(ShareLink {
            url: payload
                .web_view_link
                .or(payload.web_content_link)
                .ok_or_else(|| {
                    Error::Other("Google Drive did not return a sharable link".to_string())
                })?,
            expires_at: None,
            scope: Some("anyone".to_string()),
            allow_edit,
        })
    }

    pub async fn get_account_email(&self) -> Result<Option<String>> {
        let Some(token) = &self.token else {
            return Ok(None);
        };

        let response = self
            .client
            .get(format!("{DRIVE_BASE_URL}/about"))
            .query(&[("fields", "user(emailAddress,displayName)")])
            .bearer_auth(&token.access_token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive account lookup failed: {}", e)))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let payload: DriveAbout = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse account response: {}", e)))?;

        Ok(payload
            .user
            .map(|user| user.display_name.unwrap_or(user.email_address)))
    }

    fn build_list_query(&self, parent_id: &str, search: Option<&str>) -> String {
        let mut terms = vec![
            format!("'{}' in parents", parent_id),
            "trashed = false".into(),
        ];
        if let Some(term) = search {
            if !term.trim().is_empty() {
                let escaped = term.replace('\'', "\\'");
                terms.push(format!("name contains '{}'", escaped));
            }
        }
        terms.join(" and ")
    }

    async fn resolve_folder_id(
        &mut self,
        token: &str,
        path: &str,
        create_missing: bool,
    ) -> Result<String> {
        let normalized = self.normalize_path(path);
        if normalized == "/" {
            return Ok("root".to_string());
        }

        let mut current_parent = "root".to_string();
        let mut cursor_path = String::from("/");

        for segment in normalized.trim_start_matches('/').split('/') {
            if segment.is_empty() {
                continue;
            }

            cursor_path.push_str(segment);
            let existing = self.find_in_parent(token, &current_parent, segment).await?;

            if let Some(item) = existing {
                if !item.is_folder() {
                    return Err(Error::Other(format!(
                        "{} exists but is not a folder",
                        cursor_path
                    )));
                }
                current_parent = item.id;
            } else if create_missing {
                let created = self
                    .create_folder_with_parent(token, segment, &current_parent)
                    .await?;
                current_parent = created.id;
            } else {
                return Err(Error::Other(format!("Folder not found: {}", normalized)));
            }

            cursor_path.push('/');
        }

        Ok(current_parent)
    }

    async fn resolve_item(&mut self, token: &str, path: &str) -> Result<DriveFileItem> {
        if let Some(id) = path.strip_prefix("id:") {
            return self.fetch_item_by_id(token, id).await;
        }

        let normalized = self.normalize_path(path);
        let parent_path = Path::new(&normalized)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or("/");
        let parent_id = self.resolve_folder_id(token, parent_path, false).await?;
        let name = Path::new(&normalized)
            .file_name()
            .and_then(|os| os.to_str())
            .ok_or_else(|| Error::Other("Remote path missing file name".to_string()))?;

        let item = self
            .find_in_parent(token, &parent_id, name)
            .await?
            .ok_or_else(|| Error::Other(format!("File not found at {}", normalized)))?;

        Ok(item)
    }

    async fn find_in_parent(
        &self,
        token: &str,
        parent_id: &str,
        name: &str,
    ) -> Result<Option<DriveFileItem>> {
        let query = format!(
            "'{}' in parents and name = '{}' and trashed = false",
            parent_id,
            name.replace('\'', "\\'")
        );

        let response = self
            .client
            .get(format!("{DRIVE_BASE_URL}/files"))
            .bearer_auth(token)
            .query(&[
                ("q", query.as_str()),
                (
                    "fields",
                    "files(id,name,mimeType,modifiedTime,size,parents,webViewLink)",
                ),
                ("pageSize", "2"),
                ("spaces", "drive"),
            ])
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive lookup failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive lookup failed: {} - {}",
                status, body
            )));
        }

        let payload: DriveListResponse = response
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse lookup response: {}", e)))?;

        Ok(payload.files.into_iter().next())
    }

    async fn create_folder_with_parent(
        &self,
        token: &str,
        name: &str,
        parent_id: &str,
    ) -> Result<DriveFileItem> {
        let response = self
            .client
            .post(format!("{DRIVE_BASE_URL}/files"))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "name": name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent_id]
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive create folder failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Failed to create folder: {} - {}",
                status, body
            )));
        }

        response
            .json::<DriveFileItem>()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse create folder response: {}", e)))
    }

    async fn fetch_item_by_id(&self, token: &str, id: &str) -> Result<DriveFileItem> {
        let response = self
            .client
            .get(format!("{DRIVE_BASE_URL}/files/{id}", id = id))
            .query(&[(
                "fields",
                "id,name,mimeType,modifiedTime,size,parents,webViewLink",
            )])
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Google Drive fetch by ID failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Google Drive fetch by ID failed: {} - {}",
                status, body
            )));
        }

        response
            .json::<DriveFileItem>()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse file metadata: {}", e)))
    }

    async fn initiate_resumable_upload(
        &self,
        token: &str,
        file_name: &str,
        parent_id: &str,
        mime_type: &str,
        size: u64,
    ) -> Result<String> {
        let response = self
            .client
            .post(format!("{DRIVE_UPLOAD_URL}?uploadType=resumable"))
            .bearer_auth(token)
            .header("X-Upload-Content-Type", mime_type)
            .header("X-Upload-Content-Length", size)
            .json(&serde_json::json!({
                "name": file_name,
                "parents": [parent_id]
            }))
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to initiate resumable upload: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read response body".to_string());
            return Err(Error::Other(format!(
                "Resumable upload initiation failed: {} - {}",
                status, body
            )));
        }

        response
            .headers()
            .get("Location")
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string())
            .ok_or_else(|| Error::Other("Google Drive response missing upload URL".to_string()))
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
struct DriveListResponse {
    #[serde(default)]
    files: Vec<DriveFileItem>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveFileItem {
    id: String,
    name: String,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<DateTime<Utc>>,
    size: Option<String>,
    parents: Option<Vec<String>>,
    #[serde(rename = "webViewLink")]
    web_view_link: Option<String>,
}

impl DriveFileItem {
    fn is_folder(&self) -> bool {
        matches!(
            self.mime_type.as_deref(),
            Some("application/vnd.google-apps.folder")
        )
    }

    fn full_path(&self, parent_path: &str) -> String {
        if parent_path.ends_with('/') {
            format!("{}{}", parent_path, self.name)
        } else if parent_path == "/" {
            format!("/{}", self.name)
        } else {
            format!("{}/{}", parent_path, self.name)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareMetadata {
    #[serde(rename = "webViewLink")]
    web_view_link: Option<String>,
    #[serde(rename = "webContentLink")]
    web_content_link: Option<String>,
    #[serde(rename = "modifiedTime")]
    modified_time: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
struct DriveAbout {
    user: Option<DriveUser>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveUser {
    #[serde(rename = "emailAddress")]
    email_address: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}
