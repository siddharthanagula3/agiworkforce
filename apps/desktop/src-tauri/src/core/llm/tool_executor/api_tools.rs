use super::*;
use crate::core::agi::api_tools_impl::{build_api_download, build_api_upload};
use crate::sys::api::ApiClient;

// HTML extraction utilities from search_tools module
use super::search_tools::{extract_title, process_response_body};

impl ToolExecutor {
    pub(crate) async fn execute_api_call_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("GET");

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::ApiState;
            use tauri::Manager;

            let api_state = app.state::<ApiState>();

            let request = match crate::core::agi::api_tools_impl::build_api_request(args) {
                Ok(request) => request,
                Err(e) => {
                    let err_msg = e.to_string();
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("url".to_string(), json!(url))]),
                    });
                }
            };

            match api_state.execute_public_request(request).await {
                Ok(response) => {
                    // If response body is HTML, extract readable text instead of
                    // returning raw HTML that would be useless to the LLM
                    let raw_body = &response.body;
                    let (processed_body, was_html, truncated) =
                        process_response_body(raw_body, 15000);
                    let title = if was_html {
                        extract_title(raw_body)
                    } else {
                        None
                    };

                    let mut data = json!({
                        "status": response.status,
                        "statusCode": response.status,
                        "url": url,
                        "method": method.to_uppercase(),
                        "body": processed_body,
                        "truncated": truncated || response.truncated,
                        "success": response.success,
                    });

                    if was_html {
                        data["note"] = json!("HTML response was converted to readable text. For web searches, prefer the search_web tool.");
                        if let Some(t) = title {
                            data["page_title"] = json!(t);
                        }
                    }

                    // Only include headers for non-HTML (API) responses
                    if !was_html {
                        data["headers"] = json!(response.headers);
                    }

                    Ok(ToolResult {
                        success: true,
                        data,
                        error: None,
                        metadata: HashMap::from([("url".to_string(), json!(url))]),
                    })
                }
                Err(e) => {
                    let err_msg = format!("API call failed: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("url".to_string(), json!(url))]),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for API calls", "success": false }),
                error: Some("App handle not available for API calls".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_api_download_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let request = build_api_download(args)?;
        let url = request.url.clone();
        let save_path = args
            .get("save_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing save_path parameter"))?
            .to_string();

        let validated_path = match self
            .canonicalize_modifiable_path(&self.resolve_path(&save_path))
            .await
        {
            Ok(validated_path) => validated_path,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(&save_path))]),
                });
            }
        };
        let save_path = validated_path.to_string_lossy().to_string();

        let failed = |message: String, with_path: bool| {
            let mut metadata = HashMap::from([("url".to_string(), json!(&url))]);
            if with_path {
                metadata.insert("save_path".to_string(), json!(&save_path));
            }
            Ok(ToolResult {
                success: false,
                data: json!({ "error": message.clone(), "success": false }),
                error: Some(message),
                metadata,
            })
        };

        let download = match ApiClient::public() {
            Ok(client) => client.fetch_public_bytes(&request.url, request.auth).await,
            Err(e) => Err(e),
        };
        let download = match download {
            Ok(download) => download,
            Err(e) => return failed(format!("Download request failed: {}", e), false),
        };
        if !download.success {
            return failed(
                format!("Download failed with status: {}", download.status),
                false,
            );
        }

        if let Some(parent) = validated_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }
        let size = download.bytes.len();
        let file_exists = fs::symlink_metadata(&validated_path).await.is_ok();
        if let Err(e) = write_validated_file(&validated_path, download.bytes, !file_exists).await {
            return failed(format!("Failed to save file: {}", e), true);
        }

        if let Some(app_handle) = &self.app_handle {
            if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                let _ = undo_state
                    .change_tracker
                    .record_tool_executed_with_path(
                        "api_download".to_string(),
                        validated_path.clone(),
                        None,
                        None,
                        Uuid::new_v4().to_string(),
                        true,
                        Some("Delete downloaded file".to_string()),
                    )
                    .await;
            }
        }

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "url": url,
                "save_path": save_path,
                "bytes_downloaded": size
            }),
            error: None,
            metadata: HashMap::from([
                ("url".to_string(), json!(&url)),
                ("save_path".to_string(), json!(&save_path)),
            ]),
        })
    }

    pub(crate) async fn execute_api_upload_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let upload = build_api_upload(args)?;
        let url = upload.url.clone();
        let requested_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing file_path parameter"))?;

        // SECURITY: the path is resolved and checked once, and that same
        // canonical path is what gets uploaded. Reopening the raw spelling
        // would read a relative path against the process directory and
        // follow a link swapped in after the check.
        let validated_path = match self
            .canonicalize_readable_path(&self.resolve_path(requested_path))
            .await
        {
            Ok(validated_path) => validated_path,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("file_path".to_string(), json!(requested_path))]),
                });
            }
        };
        let file_path = validated_path.to_string_lossy().to_string();

        let client = ApiClient::public().map_err(|e| anyhow!("Upload failed: {}", e))?;
        let response = upload
            .send(&client, &validated_path)
            .await
            .map_err(|e| anyhow!("Upload failed: {}", e))?;
        let status = response.status;

        Ok(ToolResult {
            success: response.success,
            data: json!({
                "status": status,
                "response": response.body,
                "truncated": response.truncated,
                "file": file_path
            }),
            error: if status >= 400 {
                Some(format!("HTTP {}", status))
            } else {
                None
            },
            metadata: HashMap::from([
                ("url".to_string(), json!(url)),
                ("file_path".to_string(), json!(file_path)),
            ]),
        })
    }
}
