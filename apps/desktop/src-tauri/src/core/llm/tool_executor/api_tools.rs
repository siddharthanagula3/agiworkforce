use super::*;

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
        let body = args.get("body");
        let headers = args.get("headers");

        if let Some(ref app) = self.app_handle {
            use crate::sys::api::client::{ApiRequest, HttpMethod};
            use crate::sys::commands::ApiState;
            use tauri::Manager;

            let api_state = app.state::<ApiState>();

            let http_method = match method.to_uppercase().as_str() {
                "GET" => HttpMethod::Get,
                "POST" => HttpMethod::Post,
                "PUT" => HttpMethod::Put,
                "PATCH" => HttpMethod::Patch,
                "DELETE" => HttpMethod::Delete,
                _ => HttpMethod::Get,
            };

            let request = ApiRequest {
                url: url.to_string(),
                method: http_method,
                headers: headers
                    .and_then(|h| serde_json::from_value(h.clone()).ok())
                    .unwrap_or_default(),
                body: body.and_then(|b| b.as_str().map(|s| s.to_string())),
                query_params: HashMap::new(),
                auth: crate::sys::api::client::AuthType::None,
                timeout_ms: Some(30000),
            };

            match api_state.execute_request(request).await {
                Ok(response) => {
                    // If response body is HTML, extract readable text instead of
                    // returning raw HTML that would be useless to the LLM
                    let raw_body = &response.body;
                    let (processed_body, was_html) = process_response_body(raw_body, 15000);
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
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?
            .to_string();
        let save_path = args
            .get("save_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing save_path parameter"))?
            .to_string();

        // Validate destination path
        if let Err(e) = self.validate_path(&save_path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&save_path))]),
            });
        }

        // Perform the download
        let client = reqwest::Client::new();
        match client.get(&url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Download failed with status: {}", response.status()), "success": false }),
                        error: Some(format!(
                            "Download failed with status: {}",
                            response.status()
                        )),
                        metadata: HashMap::from([("url".to_string(), json!(&url))]),
                    });
                }

                match response.bytes().await {
                    Ok(bytes) => {
                        // Ensure parent directory exists
                        if let Some(parent) = Path::new(&save_path).parent() {
                            let _ = fs::create_dir_all(parent).await;
                        }

                        match fs::write(&save_path, &bytes).await {
                            Ok(_) => {
                                let size = bytes.len();

                                // Record for undo if available
                                if let Some(app_handle) = &self.app_handle {
                                    if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                                        let task_id = Uuid::new_v4().to_string();
                                        let path_buf = std::path::PathBuf::from(&save_path);
                                        let _ = undo_state
                                            .change_tracker
                                            .record_tool_executed_with_path(
                                                "api_download".to_string(),
                                                path_buf,
                                                None, // New file, no previous content
                                                None, // Downloaded file content not tracked
                                                task_id,
                                                true, // Downloads are reversible (delete the file)
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
                            Err(e) => {
                                let err_msg = format!("Failed to save file: {}", e);
                                Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": err_msg.clone(), "success": false }),
                                    error: Some(err_msg),
                                    metadata: HashMap::from([
                                        ("url".to_string(), json!(&url)),
                                        ("save_path".to_string(), json!(&save_path)),
                                    ]),
                                })
                            }
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to read response: {}", e);
                        Ok(ToolResult {
                            success: false,
                            data: json!({ "error": err_msg.clone(), "success": false }),
                            error: Some(err_msg),
                            metadata: HashMap::from([("url".to_string(), json!(&url))]),
                        })
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Download request failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("url".to_string(), json!(&url))]),
                })
            }
        }
    }

    pub(crate) async fn execute_api_upload_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing file_path parameter"))?;

        // Validate the file path
        if let Err(e) = self.validate_path(file_path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("file_path".to_string(), json!(file_path))]),
            });
        }

        // Read file
        let file_content = fs::read(file_path)
            .await
            .map_err(|e| anyhow!("Failed to read file: {}", e))?;

        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload");

        // Create multipart form
        let part = reqwest::multipart::Part::bytes(file_content).file_name(file_name.to_string());
        let form = reqwest::multipart::Form::new().part("file", part);

        let client = reqwest::Client::new();
        let response = client
            .post(url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| anyhow!("Upload failed: {}", e))?;

        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();

        Ok(ToolResult {
            success: (200..300).contains(&status),
            data: json!({
                "status": status,
                "response": body,
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
