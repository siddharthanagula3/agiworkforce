use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_cloud_upload_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{cloud_upload, CloudState, CloudUploadRequest};
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let requested_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?;
            let local_path = self
                .canonicalize_readable_path(&self.resolve_path(requested_path))
                .await?
                .to_string_lossy()
                .into_owned();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let request = CloudUploadRequest {
                account_id: account_id.clone(),
                local_path: local_path.clone(),
                remote_path: remote_path.clone(),
            };

            match cloud_upload(request, state, app.clone()).await {
                Ok(file_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_id": file_id,
                        "local_path": local_path,
                        "remote_path": remote_path,
                        "status": "uploaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to upload to cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to upload to cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_cloud_download_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{cloud_download, CloudDownloadRequest, CloudState};
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let requested_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?;
            let local_path = self
                .canonicalize_modifiable_path(&self.resolve_path(requested_path))
                .await?
                .to_string_lossy()
                .into_owned();

            let request = CloudDownloadRequest {
                account_id: account_id.clone(),
                remote_path: remote_path.clone(),
                local_path: local_path.clone(),
            };

            match cloud_download(request, state, app.clone()).await {
                Ok(()) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "remote_path": remote_path,
                        "local_path": local_path,
                        "status": "downloaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to download from cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to download from cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
