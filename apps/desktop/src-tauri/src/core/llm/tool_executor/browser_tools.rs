use super::*;

impl ToolExecutor {
    pub(crate) async fn execute_browser_tool(
        &self,
        tool_id: &str,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::automation::browser::dom_operations::{
            ClickOptions, DomOperations, TypeOptions,
        };
        use crate::automation::browser::NavigationOptions;
        use crate::sys::commands::BrowserStateWrapper;
        use tauri::Manager;

        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for browser automation"))?;
        let browser_state = app.state::<BrowserStateWrapper>();

        // Helper to get client by tab_id from args, or fall back to active client
        let get_client = || async {
            let tab_id = args
                .get("tab_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            browser_state
                .get_client_for_tab(tab_id)
                .await
                .map_err(anyhow::Error::msg)
        };

        match tool_id {
            "browser_get_url" => {
                let (client, tab_id) = get_client().await?;
                let url = client.get_url().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_title" => {
                let (client, tab_id) = get_client().await?;
                let title = client.get_title().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "title": title, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_back" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_back(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_forward" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_forward(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_reload" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .reload(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_navigation" => {
                let (client, tab_id) = get_client().await?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const navTimeout = {};
                        let lastUrl = window.location.href;
                        let resolved = false;

                        const check = () => {{
                            if (window.location.href !== lastUrl) {{
                                resolved = true;
                                resolve({{ newUrl: window.location.href }});
                                return;
                            }}

                            if (!resolved) {{
                                setTimeout(check, 100);
                            }}
                        }};

                        setTimeout(() => {{
                            if (!resolved) {{
                                reject(new Error('Navigation timeout'));
                            }}
                        }}, navTimeout);

                        check();
                    }})
                    "#,
                    timeout_ms
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_execute_async_js" => {
                let (client, tab_id) = get_client().await?;
                let script = args
                    .get("script")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing script parameter"))?;
                // For async JS, wrap it in a Promise and await it
                let await_promise = args
                    .get("await_promise")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let wrapped_script = if await_promise {
                    format!(
                        "new Promise((resolve) => {{ {}; resolve(undefined); }})",
                        script
                    )
                } else {
                    script.to_string()
                };
                let result = client
                    .evaluate(&wrapped_script)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_element_state" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let script = format!(
                    r#"
                    (function() {{
                        const el = document.querySelector('{}');
                        if (!el) return {{ error: 'Element not found' }};
                        const rect = el.getBoundingClientRect();
                        return {{
                            visible: rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none',
                            enabled: !el.disabled,
                            checked: el.checked,
                            selected: el.selected,
                            focused: document.activeElement === el,
                            tagName: el.tagName.toLowerCase(),
                            id: el.id,
                            classes: el.className
                        }};
                    }})()
                    "#,
                    selector
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "state": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_interactive" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const timeout = {};
                        const interval = 100;
                        let elapsed = 0;

                        const check = () => {{
                            const el = document.querySelector('{}');
                            if (!el) {{
                                elapsed += interval;
                                if (elapsed >= timeout) {{
                                    reject(new Error('Element not found'));
                                    return;
                                }}
                                setTimeout(check, interval);
                                return;
                            }}

                            const rect = el.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                            const isEnabled = !el.disabled;

                            if (isVisible && isEnabled) {{
                                resolve(true);
                                return;
                            }}

                            elapsed += interval;
                            if (elapsed >= timeout) {{
                                reject(new Error('Timeout waiting for element to be interactive'));
                                return;
                            }}


                            setTimeout(check, interval);
                        }};

                        check();
                    }})
                    "#,
                    timeout_ms, selector
                );
                client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_click" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::click(&client, selector, ClickOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_extract" => {
                let (client, tab_id) = get_client().await?;
                let text = if let Some(selector) = args.get("selector").and_then(|v| v.as_str()) {
                    DomOperations::get_text(&client, selector)
                        .await
                        .map_err(anyhow::Error::msg)?
                } else {
                    DomOperations::get_text(&client, "body")
                        .await
                        .map_err(anyhow::Error::msg)?
                };
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": text, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_type" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let text = args
                    .get("text")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing text parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::type_text(&client, selector, text, TypeOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_selector" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let timeout_ms = args
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(120_000);
                let (client, tab_id) = get_client().await?;
                DomOperations::wait_for_selector(&client, selector, timeout_ms)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_text" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                let text = DomOperations::get_text(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "text": text, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_content" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_dom_snapshot" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "html": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_attribute" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let attribute = args
                    .get("attribute")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing attribute parameter"))?;
                let (client, tab_id) = get_client().await?;
                let value = DomOperations::get_attribute(&client, selector, attribute)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "value": value,
                        "selector": selector,
                        "attribute": attribute,
                        "tab_id": tab_id
                    }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_screenshot" => {
                let (client, tab_id) = get_client().await?;
                let bytes = client
                    .capture_screenshot(false)
                    .await
                    .map_err(anyhow::Error::msg)?;
                use base64::{engine::general_purpose::STANDARD, Engine};
                Ok(ToolResult {
                    success: true,
                    data: json!({ "image_base64": STANDARD.encode(bytes), "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_hover" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::hover(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_focus" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::focus(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_scroll_into_view" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::scroll_into_view(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_query_all" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                let elements = DomOperations::query_all(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                let texts: Vec<String> = elements.into_iter().map(|e| e.text).collect();
                Ok(ToolResult {
                    success: true,
                    data: json!({ "results": texts, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_select_option" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let value = args
                    .get("value")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing value parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::select_option(&client, selector, value)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "value": value, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_check" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::check(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_uncheck" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::uncheck(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_autofill_job_application" => {
                let (client, tab_id) = get_client().await?;
                let mut profile = Self::build_job_autofill_profile(&args)?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "resume_path",
                    "resumeDataUrl",
                    "resumeFileName",
                    "resume.pdf",
                )
                .await?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "cover_letter_path",
                    "coverLetterDataUrl",
                    "coverLetterFileName",
                    "cover-letter.pdf",
                )
                .await?;

                let options = Self::build_job_autofill_options(&args);
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(120_000)
                    .clamp(5_000, 300_000);

                let script = build_job_autofill_eval_script(
                    &Value::Object(profile),
                    &Value::Object(options),
                    timeout_ms,
                )?;

                let response = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                let success = response
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let response_error = response
                    .get("error")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string());

                Ok(ToolResult {
                    success,
                    data: json!({
                        "tab_id": tab_id,
                        "platform": response.get("platform").cloned().unwrap_or(Value::Null),
                        "filled_count": response.get("filledCount").cloned().unwrap_or(json!(0)),
                        "skipped_count": response.get("skippedCount").cloned().unwrap_or(json!(0)),
                        "missing_required_fields": response
                            .get("missingRequiredFields")
                            .cloned()
                            .unwrap_or_else(|| json!([])),
                        "submitted": response.get("submitted").cloned().unwrap_or(json!(false)),
                        "steps_advanced": response.get("stepsAdvanced").cloned().unwrap_or(json!(0)),
                        "details": response.get("details").cloned().unwrap_or_else(|| json!({})),
                        "result": response
                    }),
                    error: if success {
                        None
                    } else {
                        Some(response_error.unwrap_or_else(|| {
                            "Job autofill failed in browser context".to_string()
                        }))
                    },
                    metadata: HashMap::from([("tab_id".to_string(), json!(tab_id))]),
                })
            }
            "browser_navigate" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;

                // NOTE: We must NOT hold the outer tab_manager lock while calling
                // TabManager methods that acquire internal locks. This would cause a deadlock
                // because tokio::sync::Mutex is not reentrant.
                // Instead, we drop the guard and re-acquire for each operation.

                // First, list existing tabs
                let tabs = {
                    let guard = tab_manager.lock().await;
                    guard.list_tabs().await.map_err(anyhow::Error::msg)?
                };

                let tab_id = if tabs.is_empty() {
                    // Open a new tab - release outer lock first
                    let guard = tab_manager.lock().await;
                    guard.open_tab(url).await.map_err(anyhow::Error::msg)?
                } else {
                    tabs[0].id.clone()
                };

                // Navigate - release outer lock first
                {
                    let guard = tab_manager.lock().await;
                    guard
                        .navigate(&tab_id, url, NavigationOptions::default())
                        .await
                        .map_err(anyhow::Error::msg)?;
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            _ => Err(anyhow!("Unknown browser tool: {}", tool_id)),
        }
    }

    pub(crate) async fn execute_browser_navigate_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let tool_id = action_id;

        if let Some(ref app) = self.app_handle {
            use crate::automation::browser::NavigationOptions;
            use crate::sys::commands::BrowserStateWrapper;
            use tauri::Manager;

            // Emit progress: starting navigation
            emit_tool_progress(
                app,
                tool_id,
                0.1,
                Some(&format!("Navigating to {}", &url[..url.len().min(50)])),
            );

            let browser_state = app.state::<BrowserStateWrapper>();
            let tab_manager = match browser_state.get_tab_manager() {
                Ok(tm) => tm.lock().await,
                Err(e) => {
                    let err_msg = format!("Failed to get tab manager: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            emit_tool_progress(app, tool_id, 0.3, Some("Browser ready"));

            match tab_manager.list_tabs().await {
                Ok(tabs) => {
                    let tab_id = if tabs.is_empty() {
                        emit_tool_progress(app, tool_id, 0.4, Some("Opening new tab"));
                        match tab_manager.open_tab(url).await {
                            Ok(tid) => tid,
                            Err(e) => {
                                let err_msg = format!("Failed to open tab: {}", e);
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": err_msg.clone(), "success": false }),
                                    error: Some(err_msg),
                                    metadata: HashMap::new(),
                                });
                            }
                        }
                    } else {
                        tabs[0].id.clone()
                    };

                    emit_tool_progress(app, tool_id, 0.6, Some("Loading page..."));

                    match tab_manager
                        .navigate(&tab_id, url, NavigationOptions::default())
                        .await
                    {
                        Ok(_) => {
                            emit_tool_progress(app, tool_id, 1.0, Some("Page loaded"));
                            Ok(ToolResult {
                                success: true,
                                data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                                error: None,
                                metadata: HashMap::new(),
                            })
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to navigate: {}", e);
                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": err_msg.clone(), "success": false }),
                                error: Some(err_msg),
                                metadata: HashMap::new(),
                            })
                        }
                    }
                }
                Err(e) => {
                    let err_msg = format!("Failed to list tabs: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for browser navigation".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) fn build_job_autofill_profile(
        args: &HashMap<String, Value>,
    ) -> Result<serde_json::Map<String, Value>> {
        let mut profile = Self::parse_object_argument(args, "profile").unwrap_or_default();

        let canonical_fields = [
            "firstName",
            "lastName",
            "fullName",
            "email",
            "phone",
            "locationCity",
            "locationState",
            "locationCountry",
            "linkedinUrl",
            "githubUrl",
            "portfolioUrl",
            "websiteUrl",
            "currentCompany",
            "currentTitle",
            "yearsOfExperience",
            "workAuthorization",
            "requiresSponsorship",
            "salaryExpectation",
            "resumeText",
            "coverLetterText",
            "customAnswers",
            "files",
        ];

        for key in canonical_fields {
            if profile.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    profile.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("first_name", "firstName"),
            ("last_name", "lastName"),
            ("full_name", "fullName"),
            ("location_city", "locationCity"),
            ("location_state", "locationState"),
            ("location_country", "locationCountry"),
            ("linkedin_url", "linkedinUrl"),
            ("github_url", "githubUrl"),
            ("portfolio_url", "portfolioUrl"),
            ("website_url", "websiteUrl"),
            ("current_company", "currentCompany"),
            ("current_title", "currentTitle"),
            ("years_of_experience", "yearsOfExperience"),
            ("work_authorization", "workAuthorization"),
            ("requires_sponsorship", "requiresSponsorship"),
            ("salary_expectation", "salaryExpectation"),
            ("resume_text", "resumeText"),
            ("cover_letter_text", "coverLetterText"),
            ("custom_answers", "customAnswers"),
        ];

        for (alias_key, canonical_key) in aliases {
            if profile.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    profile.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        if profile.is_empty() {
            return Err(anyhow!(
                "Missing profile parameter. Provide a 'profile' object with fields like firstName/email/phone."
            ));
        }

        Ok(profile)
    }

    pub(super) fn build_job_autofill_options(args: &HashMap<String, Value>) -> serde_json::Map<String, Value> {
        let mut options = Self::parse_object_argument(args, "options").unwrap_or_default();

        let canonical_fields = [
            "platform",
            "autoSubmit",
            "allowSubmitWithMissingRequired",
            "includeOptionalFields",
            "delayMs",
            "maxSubmitSteps",
        ];

        for key in canonical_fields {
            if options.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    options.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("auto_submit", "autoSubmit"),
            (
                "allow_submit_with_missing_required",
                "allowSubmitWithMissingRequired",
            ),
            ("include_optional_fields", "includeOptionalFields"),
            ("delay_ms", "delayMs"),
            ("max_submit_steps", "maxSubmitSteps"),
        ];

        for (alias_key, canonical_key) in aliases {
            if options.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    options.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        options
    }

    pub(crate) async fn attach_job_profile_file_from_path(
        &self,
        profile: &mut serde_json::Map<String, Value>,
        args: &HashMap<String, Value>,
        path_key: &str,
        data_key: &str,
        file_name_key: &str,
        default_file_name: &str,
    ) -> Result<()> {
        let Some(path) = args
            .get(path_key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(());
        };

        self.validate_path(path).await?;
        let (data_url, file_name) =
            crate::core::llm::job_autofill_runtime::encode_file_as_data_url(
                path,
                default_file_name,
            )
            .await
            .map_err(|e| anyhow!("Failed to encode {} '{}': {}", path_key, path, e))?;

        let files_value = profile
            .entry("files".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !files_value.is_object() {
            *files_value = Value::Object(serde_json::Map::new());
        }

        if let Some(files) = files_value.as_object_mut() {
            files
                .entry(data_key.to_string())
                .or_insert_with(|| Value::String(data_url));
            files
                .entry(file_name_key.to_string())
                .or_insert_with(|| Value::String(file_name));
        }

        Ok(())
    }
}
