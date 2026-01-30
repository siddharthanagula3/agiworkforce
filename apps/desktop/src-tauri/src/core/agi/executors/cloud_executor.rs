//! Cloud storage operations executor.
//!
//! Handles cloud storage operations including uploading, downloading, listing,
//! deleting, creating folders, and sharing files across multiple cloud providers
//! (Google Drive, Dropbox, OneDrive).
//!
//! # Supported Operations
//!
//! - `cloud_upload`: Upload files to cloud storage with automatic chunked uploads for large files
//! - `cloud_download`: Download files from cloud storage to local filesystem
//! - `cloud_list`: List files and folders in a cloud storage directory
//! - `cloud_delete`: Delete files or folders from cloud storage
//! - `cloud_create_folder`: Create a new folder in cloud storage
//! - `cloud_share`: Generate a shareable link for a cloud file
//!
//! # Provider Support
//!
//! All operations work uniformly across:
//! - Google Drive (via OAuth2 with PKCE)
//! - Dropbox (via OAuth2)
//! - OneDrive (via Microsoft Graph API with PKCE)
//!
//! # Chunked Uploads
//!
//! Large file uploads are automatically handled with chunked/resumable uploads:
//! - Google Drive: 10MB chunks via resumable upload API
//! - Dropbox: 8MB chunks via upload sessions
//! - OneDrive: 8MB chunks via upload sessions (files > 4MB)

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Executor for cloud storage operations.
///
/// This executor provides a unified interface for cloud storage operations
/// across Google Drive, Dropbox, and OneDrive. It delegates to the
/// `CloudStorageManager` for actual cloud provider interactions.
pub struct CloudExecutor;

impl CloudExecutor {
    /// Create a new cloud executor.
    ///
    /// The executor is stateless; all context is provided via the `execute` method.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for CloudExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for CloudExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "cloud_upload",
            "cloud_download",
            "cloud_list",
            "cloud_delete",
            "cloud_create_folder",
            "cloud_share",
        ]
    }

    fn description(&self) -> &'static str {
        "Cloud storage operations executor for Google Drive, Dropbox, and OneDrive"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "cloud_upload" => execute_upload(context, parameters).await,
            "cloud_download" => execute_download(context, parameters).await,
            "cloud_list" => execute_list(context, parameters).await,
            "cloud_delete" => execute_delete(context, parameters).await,
            "cloud_create_folder" => execute_create_folder(context, parameters).await,
            "cloud_share" => execute_share(context, parameters).await,
            _ => Err(anyhow!("Unknown cloud tool: {}", tool_name)),
        }
    }
}

/// Execute cloud_upload operation.
///
/// Uploads a local file to cloud storage. Large files are automatically
/// uploaded using chunked/resumable uploads for reliability.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier from `cloud_connect`
/// - `local_path` (required): Path to the local file to upload
/// - `remote_path` (required): Destination path in cloud storage
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating upload success
/// - `file_id`: Provider-specific file identifier
/// - `account_id`: The account used for upload
/// - `local_path`: The source local path
/// - `remote_path`: The destination cloud path
///
/// # Chunked Upload Behavior
///
/// Files are automatically uploaded in chunks when they exceed provider thresholds:
/// - Google Drive: Uses resumable upload API with 10MB chunks
/// - Dropbox: Uses upload sessions with 8MB chunks
/// - OneDrive: Uses upload sessions for files > 4MB with 8MB chunks
async fn execute_upload(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
    let local_path = parameters
        .get("local_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'local_path' parameter"))?;
    let remote_path = parameters
        .get("remote_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'remote_path' parameter"))?;

    // Validate local file exists
    let local_path_buf = std::path::Path::new(local_path);
    if !local_path_buf.exists() {
        return Err(anyhow!(
            "Local file not found: '{}'. Please check the path and try again.",
            local_path
        ));
    }
    if !local_path_buf.is_file() {
        return Err(anyhow!(
            "'{}' is not a file. Use cloud_create_folder for directories.",
            local_path
        ));
    }

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot upload to cloud storage right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    // Clone values for the closure
    let account_id_clone = account_id.to_string();
    let remote_path_clone = remote_path.to_string();
    let local_path_clone = local_path.to_string();

    // Get file size for progress tracking
    let file_metadata = std::fs::metadata(local_path)
        .map_err(|e| anyhow!("Cannot read file '{}': {}", local_path, e))?;
    let file_size = file_metadata.len();

    tracing::info!(
        "[CloudExecutor] Starting cloud upload: local_path={}, remote_path={}, size={} bytes",
        local_path,
        remote_path,
        file_size
    );

    // Emit progress event for large files
    if file_size > 10 * 1024 * 1024 {
        // > 10MB
        context.emit_progress(
            &format!(
                "Uploading {} ({:.1} MB)...",
                remote_path,
                file_size as f64 / 1_048_576.0
            ),
            Some(0.0),
        );
    }

    let file_id = cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let remote = remote_path_clone.clone();
            let local = local_path_clone.clone();
            Box::pin(async move { client.upload(&local, &remote).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Upload failed: {}. Make sure your cloud account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[CloudExecutor] Cloud upload successful: file_id={}, local_path={}, remote_path={}",
        file_id,
        local_path,
        remote_path
    );

    Ok(json!({
        "success": true,
        "file_id": file_id,
        "account_id": account_id,
        "local_path": local_path,
        "remote_path": remote_path,
        "size_bytes": file_size
    }))
}

/// Execute cloud_download operation.
///
/// Downloads a file from cloud storage to a local path.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier
/// - `remote_path` (required): Path to the file in cloud storage (or "id:FILE_ID" format)
/// - `local_path` (required): Destination path on local filesystem
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating download success
/// - `account_id`: The account used for download
/// - `remote_path`: The source cloud path
/// - `local_path`: The destination local path
async fn execute_download(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
    let remote_path = parameters
        .get("remote_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'remote_path' parameter"))?;
    let local_path = parameters
        .get("local_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'local_path' parameter"))?;

    // Validate local directory exists
    let local_path_buf = std::path::Path::new(local_path);
    if let Some(parent) = local_path_buf.parent() {
        if !parent.exists() {
            return Err(anyhow!(
                "Directory '{}' does not exist. Please create it first.",
                parent.display()
            ));
        }
    }

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot download from cloud storage right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    let account_id_clone = account_id.to_string();
    let remote_path_clone = remote_path.to_string();
    let local_path_clone = local_path.to_string();

    tracing::info!(
        "[CloudExecutor] Starting cloud download: remote_path={}, local_path={}",
        remote_path,
        local_path
    );

    context.emit_progress(&format!("Downloading {}...", remote_path), Some(0.0));

    cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let remote = remote_path_clone.clone();
            let local = local_path_clone.clone();
            Box::pin(async move { client.download(&remote, &local).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Download failed: {}. Make sure the file exists and your account is connected.",
                e
            )
        })?;

    // Get downloaded file size
    let downloaded_size = std::fs::metadata(local_path).map(|m| m.len()).unwrap_or(0);

    tracing::info!(
        "[CloudExecutor] Cloud download successful: remote_path={}, local_path={}, size={} bytes",
        remote_path,
        local_path,
        downloaded_size
    );

    Ok(json!({
        "success": true,
        "account_id": account_id,
        "remote_path": remote_path,
        "local_path": local_path,
        "size_bytes": downloaded_size
    }))
}

/// Execute cloud_list operation.
///
/// Lists files and folders in a cloud storage directory.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier
/// - `folder_path` (optional): Path to the folder to list (defaults to root "/")
/// - `search` (optional): Search term to filter results by name
/// - `include_folders` (optional): Whether to include folders in results (default: true)
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating operation success
/// - `account_id`: The account used
/// - `folder_path`: The path that was listed
/// - `count`: Number of items returned
/// - `files`: Array of file/folder objects with id, name, path, size, etc.
async fn execute_list(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;

    let folder_path = parameters
        .get("folder_path")
        .and_then(|v| v.as_str())
        .map(String::from);

    let search = parameters
        .get("search")
        .and_then(|v| v.as_str())
        .map(String::from);

    let include_folders = parameters
        .get("include_folders")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot list cloud storage right now. Please try again later."
        ));
    };

    use crate::integrations::cloud::ListOptions;
    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    let account_id_clone = account_id.to_string();
    let options = ListOptions {
        folder_path: folder_path.clone(),
        search: search.clone(),
        include_folders,
    };

    tracing::info!(
        "[CloudExecutor] Listing cloud storage: account_id={}, folder_path={:?}, search={:?}",
        account_id,
        folder_path,
        search
    );

    let files = cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let opts = options.clone();
            Box::pin(async move { client.list(opts).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to list files: {}. Make sure the folder exists and your account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[CloudExecutor] Cloud list successful: account_id={}, count={}",
        account_id,
        files.len()
    );

    Ok(json!({
        "success": true,
        "account_id": account_id,
        "folder_path": folder_path.unwrap_or_else(|| "/".to_string()),
        "search": search,
        "count": files.len(),
        "files": serde_json::to_value(&files).map_err(|e| anyhow!("Failed to serialize files: {}", e))?
    }))
}

/// Execute cloud_delete operation.
///
/// Deletes a file or folder from cloud storage.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier
/// - `remote_path` (required): Path to the file/folder to delete (or "id:FILE_ID" format)
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating deletion success
/// - `account_id`: The account used
/// - `remote_path`: The path that was deleted
async fn execute_delete(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
    let remote_path = parameters
        .get("remote_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'remote_path' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot delete from cloud storage right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    let account_id_clone = account_id.to_string();
    let remote_path_clone = remote_path.to_string();

    tracing::info!(
        "[CloudExecutor] Deleting from cloud storage: account_id={}, remote_path={}",
        account_id,
        remote_path
    );

    cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let remote = remote_path_clone.clone();
            Box::pin(async move { client.delete(&remote).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Delete failed: {}. Make sure the file exists and your account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[CloudExecutor] Cloud delete successful: account_id={}, remote_path={}",
        account_id,
        remote_path
    );

    Ok(json!({
        "success": true,
        "account_id": account_id,
        "remote_path": remote_path
    }))
}

/// Execute cloud_create_folder operation.
///
/// Creates a new folder in cloud storage.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier
/// - `folder_path` (required): Path for the new folder
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating creation success
/// - `folder_id`: Provider-specific folder identifier
/// - `account_id`: The account used
/// - `folder_path`: The path of the created folder
async fn execute_create_folder(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
    let folder_path = parameters
        .get("folder_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'folder_path' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot create folder in cloud storage right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    let account_id_clone = account_id.to_string();
    let folder_path_clone = folder_path.to_string();

    tracing::info!(
        "[CloudExecutor] Creating cloud folder: account_id={}, folder_path={}",
        account_id,
        folder_path
    );

    let folder_id = cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let path = folder_path_clone.clone();
            Box::pin(async move { client.create_folder(&path).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to create folder: {}. Make sure your account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[CloudExecutor] Cloud folder created: account_id={}, folder_path={}, folder_id={}",
        account_id,
        folder_path,
        folder_id
    );

    Ok(json!({
        "success": true,
        "folder_id": folder_id,
        "account_id": account_id,
        "folder_path": folder_path
    }))
}

/// Execute cloud_share operation.
///
/// Creates a shareable link for a cloud file or folder.
///
/// # Parameters
///
/// - `account_id` (required): The cloud account identifier
/// - `remote_path` (required): Path to the file/folder to share (or "id:FILE_ID" format)
/// - `allow_edit` (optional): Whether to allow editing (default: false, view-only)
///
/// # Returns
///
/// JSON object with:
/// - `success`: boolean indicating operation success
/// - `account_id`: The account used
/// - `remote_path`: The path that was shared
/// - `share_link`: Object containing url, expires_at, scope, and allow_edit
async fn execute_share(
    context: &ExecutorContext,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    let account_id = parameters
        .get("account_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;
    let remote_path = parameters
        .get("remote_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'remote_path' parameter"))?;
    let allow_edit = parameters
        .get("allow_edit")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!(
            "Cannot create share link right now. Please try again later."
        ));
    };

    use tauri::Manager;

    let cloud_state = app.state::<crate::sys::commands::CloudState>();

    let account_id_clone = account_id.to_string();
    let remote_path_clone = remote_path.to_string();

    tracing::info!(
        "[CloudExecutor] Creating share link: account_id={}, remote_path={}, allow_edit={}",
        account_id,
        remote_path,
        allow_edit
    );

    let share_link = cloud_state
        .manager
        .with_client(&account_id_clone, move |client| {
            let remote = remote_path_clone.clone();
            Box::pin(async move { client.share_link(&remote, allow_edit).await })
        })
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to create share link: {}. Make sure the file exists and your account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[CloudExecutor] Share link created: account_id={}, remote_path={}, url={}",
        account_id,
        remote_path,
        share_link.url
    );

    Ok(json!({
        "success": true,
        "account_id": account_id,
        "remote_path": remote_path,
        "share_link": {
            "url": share_link.url,
            "expires_at": share_link.expires_at,
            "scope": share_link.scope,
            "allow_edit": share_link.allow_edit
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cloud_executor_tool_names() {
        let executor = CloudExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"cloud_upload"));
        assert!(names.contains(&"cloud_download"));
        assert!(names.contains(&"cloud_list"));
        assert!(names.contains(&"cloud_delete"));
        assert!(names.contains(&"cloud_create_folder"));
        assert!(names.contains(&"cloud_share"));
        assert_eq!(names.len(), 6);
    }

    #[test]
    fn test_cloud_executor_description() {
        let executor = CloudExecutor::new();
        let description = executor.description();

        assert!(!description.is_empty());
        assert!(description.contains("Cloud"));
    }

    #[test]
    fn test_cloud_executor_default() {
        let executor = CloudExecutor::default();
        assert_eq!(executor.tool_names().len(), 6);
    }
}
