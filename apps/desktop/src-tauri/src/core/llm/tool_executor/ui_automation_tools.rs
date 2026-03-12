use super::*;

impl ToolExecutor {
    pub(super) async fn execute_ui_screenshot_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        use crate::automation::screen::capture_primary_screen;
        match capture_primary_screen() {
            Ok(captured) => {
                let temp_file = match tempfile::Builder::new()
                    .prefix("screenshot_")
                    .suffix(".png")
                    .tempfile()
                {
                    Ok(file) => file,
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            data: json!({ "error": format!("Failed to create temp file: {}", e), "success": false }),
                            error: Some(format!("Failed to create temp file: {}", e)),
                            metadata: HashMap::new(),
                        });
                    }
                };

                let temp_path = temp_file.path();
                match captured.pixels.save(temp_path) {
                    Ok(_) => {
                        let (file, path) = temp_file
                            .keep()
                            .map_err(|e| anyhow!("Failed to persist temp file: {}", e))?;
                        drop(file);

                        Ok(ToolResult {
                            success: true,
                            data: json!({
                                "screenshot_path": path.to_string_lossy().to_string(),
                                "cleanup_note": "File will be cleaned up by OS temp directory cleanup"
                            }),
                            error: None,
                            metadata: HashMap::from([
                                ("temp_file".to_string(), json!(true)),
                                (
                                    "path".to_string(),
                                    json!(path.to_string_lossy().to_string()),
                                ),
                            ]),
                        })
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to save screenshot: {}", e), "success": false }),
                        error: Some(format!("Failed to save screenshot: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to capture screenshot: {}", e), "success": false }),
                error: Some(format!("Failed to capture screenshot: {}", e)),
                metadata: HashMap::new(),
            }),
        }
    }

    pub(super) async fn execute_ui_click_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::automation::{input::MouseButton, types::ElementQuery, AutomationService};
            use tauri::Manager;

            let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
            let automation = match automation_opt.as_ref() {
                Some(_) => match AutomationService::new() {
                    Ok(service) => std::sync::Arc::new(service),
                    Err(e) => {
                        return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Automation service not available: {}. Please grant accessibility permissions.", e), "success": false }),
                                error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                metadata: HashMap::new(),
                            });
                    }
                },
                None => {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string(), "success": false }),
                        error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                        metadata: HashMap::new(),
                    });
                }
            };
            let target = args
                .get("target")
                .ok_or_else(|| anyhow!("Missing target parameter"))?;

            if let Some(coords) = target.get("coordinates") {
                let x = coords.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = coords.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let mut mouse_guard = automation.mouse.lock().await;
                let mouse_result = match mouse_guard.as_mut() {
                    Some(mouse) => mouse.click(x, y, MouseButton::Left),
                    None => Err(anyhow!(
                        "Mouse automation requires Input Monitoring permission. \
                         Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring."
                    )),
                };
                match mouse_result {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "clicked", "x": x, "y": y }),
                        error: None,
                        metadata: HashMap::new(),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to click: {}", e), "success": false }),
                        error: Some(format!("Failed to click: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                match automation.native.invoke(element_id) {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "invoked", "element_id": element_id }),
                        error: None,
                        metadata: HashMap::new(),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to invoke element: {}", e), "success": false }),
                        error: Some(format!("Failed to invoke element: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                let query = ElementQuery {
                    window: None,
                    window_class: None,
                    name: Some(text.to_string()),
                    class_name: None,
                    automation_id: None,
                    control_type: None,
                    max_results: Some(1),
                };
                match automation.native.find_elements(None, &query) {
                    Ok(elements) => {
                        if let Some(element) = elements.first() {
                            match automation.native.invoke(&element.id) {
                                Ok(_) => Ok(ToolResult {
                                    success: true,
                                    data: json!({ "success": true, "action": "invoked", "element_id": element.id, "found_by": "text", "text": text }),
                                    error: None,
                                    metadata: HashMap::new(),
                                }),
                                Err(e) => Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": format!("Failed to invoke element: {}", e), "success": false }),
                                    error: Some(format!("Failed to invoke element: {}", e)),
                                    metadata: HashMap::new(),
                                }),
                            }
                        } else {
                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Element with text '{}' not found", text), "success": false }),
                                error: Some(format!("Element with text '{}' not found", text)),
                                metadata: HashMap::new(),
                            })
                        }
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to find element: {}", e), "success": false }),
                        error: Some(format!("Failed to find element: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else {
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Invalid target format for ui_click - need coordinates, element_id, or text".to_string(), "success": false }),
                    error: Some("Invalid target format for ui_click - need coordinates, element_id, or text".to_string()),
                    metadata: HashMap::new(),
                })
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for UI automation".to_string(), "success": false }),
                error: Some("App handle not available for UI automation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(super) async fn execute_ui_type_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::automation::{
                input::KeyboardSimulator, types::ElementQuery, AutomationService,
            };
            use tauri::Manager;

            let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
            let automation = match automation_opt.as_ref() {
                Some(_) => match AutomationService::new() {
                    Ok(service) => std::sync::Arc::new(service),
                    Err(e) => {
                        return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Automation service not available: {}. Please grant accessibility permissions.", e), "success": false }),
                                error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                metadata: HashMap::new(),
                            });
                    }
                },
                None => {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string(), "success": false }),
                        error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                        metadata: HashMap::new(),
                    });
                }
            };
            let target = args
                .get("target")
                .ok_or_else(|| anyhow!("Missing target parameter"))?;
            let text = args
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing text parameter"))?;

            if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                if let Err(e) = automation.native.set_focus(element_id) {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to focus element: {}", e), "success": false }),
                        error: Some(format!("Failed to focus element: {}", e)),
                        metadata: HashMap::new(),
                    });
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
                let query = ElementQuery {
                    window: None,
                    window_class: None,
                    name: Some(target_text.to_string()),
                    class_name: None,
                    automation_id: None,
                    control_type: None,
                    max_results: Some(1),
                };
                match automation.native.find_elements(None, &query) {
                    Ok(elements) => {
                        if let Some(element) = elements.first() {
                            if let Err(e) = automation.native.set_focus(&element.id) {
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": format!("Failed to focus element: {}", e), "success": false }),
                                    error: Some(format!("Failed to focus element: {}", e)),
                                    metadata: HashMap::new(),
                                });
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        }
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            data: json!({ "error": format!("Failed to find element: {}", e), "success": false }),
                            error: Some(format!("Failed to find element: {}", e)),
                            metadata: HashMap::new(),
                        });
                    }
                }
            }

            let mut keyboard = KeyboardSimulator::new()
                .map_err(|e| anyhow!("Failed to create keyboard simulator: {}", e))?;
            let send_result = keyboard.send_text(text).await;
            match send_result {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "action": "typed", "text": text }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to type text: {}", e), "success": false }),
                    error: Some(format!("Failed to type text: {}", e)),
                    metadata: HashMap::new(),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for UI automation".to_string(), "success": false }),
                error: Some("App handle not available for UI automation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}
