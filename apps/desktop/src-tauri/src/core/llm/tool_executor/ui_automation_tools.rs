use super::*;

fn parse_ui_coordinates(target: &Value) -> Result<Option<(i32, i32)>> {
    let coordinate_source = target.get("coordinates").unwrap_or(target);
    let Some(x) = coordinate_source.get("x").and_then(Value::as_i64) else {
        return Ok(None);
    };
    let Some(y) = coordinate_source.get("y").and_then(Value::as_i64) else {
        return Err(anyhow!("Target coordinates must include both x and y"));
    };
    const MIN_COORD: i64 = -16_000;
    const MAX_COORD: i64 = 32_000;
    if !(MIN_COORD..=MAX_COORD).contains(&x) || !(MIN_COORD..=MAX_COORD).contains(&y) {
        return Err(anyhow!(
            "Target coordinates out of bounds: ({x}, {y}). Must be between {MIN_COORD} and {MAX_COORD}"
        ));
    }
    Ok(Some((x as i32, y as i32)))
}

fn parse_ui_mouse_button(
    args: &HashMap<String, Value>,
) -> Result<(crate::automation::input::MouseButton, &'static str)> {
    let button = args
        .get("button")
        .and_then(Value::as_str)
        .unwrap_or("left")
        .trim()
        .to_ascii_lowercase();
    match button.as_str() {
        "" | "left" => Ok((crate::automation::input::MouseButton::Left, "left")),
        "right" => Ok((crate::automation::input::MouseButton::Right, "right")),
        "middle" => Ok((crate::automation::input::MouseButton::Middle, "middle")),
        _ => Err(anyhow!("button must be one of: left, right, middle")),
    }
}

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
            use crate::automation::{types::ElementQuery, AutomationService};
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
            let (button, button_name) = parse_ui_mouse_button(args)?;

            if let Some((x, y)) = parse_ui_coordinates(target)? {
                let mut mouse_guard = automation.mouse.lock().await;
                let mouse_result = match mouse_guard.as_mut() {
                    Some(mouse) => mouse.click(x, y, button),
                    None => Err(anyhow!(
                        "Mouse automation requires Input Monitoring permission. \
                         Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring."
                    )),
                };
                match mouse_result {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "clicked", "x": x, "y": y, "button": button_name }),
                        error: None,
                        metadata: HashMap::from([
                            ("target_kind".to_string(), json!("coordinates")),
                            ("button".to_string(), json!(button_name)),
                        ]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to click: {}", e), "success": false }),
                        error: Some(format!("Failed to click: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                if button_name != "left" {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "element_id targets support only left-button invocation; use coordinates for right or middle click", "success": false }),
                        error: Some("element_id targets support only left-button invocation; use coordinates for right or middle click".to_string()),
                        metadata: HashMap::new(),
                    });
                }
                match automation.native.invoke(element_id) {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "invoked", "element_id": element_id }),
                        error: None,
                        metadata: HashMap::from([("target_kind".to_string(), json!("element_id"))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to invoke element: {}", e), "success": false }),
                        error: Some(format!("Failed to invoke element: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                if button_name != "left" {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "text targets support only left-button invocation; use coordinates for right or middle click", "success": false }),
                        error: Some("text targets support only left-button invocation; use coordinates for right or middle click".to_string()),
                        metadata: HashMap::new(),
                    });
                }
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
                                    metadata: HashMap::from([(
                                        "target_kind".to_string(),
                                        json!("text"),
                                    )]),
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
                input::{KeyboardSimulator, MouseButton},
                types::ElementQuery,
                AutomationService,
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
            if text.is_empty() {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Text must not be empty", "success": false }),
                    error: Some("Text must not be empty".to_string()),
                    metadata: HashMap::new(),
                });
            }

            let target_kind = if let Some((x, y)) = parse_ui_coordinates(target)? {
                let mut mouse_guard = automation.mouse.lock().await;
                let click_result = match mouse_guard.as_mut() {
                    Some(mouse) => mouse.click(x, y, MouseButton::Left),
                    None => Err(anyhow!(
                        "Mouse automation requires Input Monitoring permission. \
                         Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring."
                    )),
                };
                if let Err(e) = click_result {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to focus coordinates before typing: {}", e), "success": false }),
                        error: Some(format!("Failed to focus coordinates before typing: {}", e)),
                        metadata: HashMap::new(),
                    });
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                "coordinates"
            } else if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                if let Err(e) = automation.native.set_focus(element_id) {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to focus element: {}", e), "success": false }),
                        error: Some(format!("Failed to focus element: {}", e)),
                        metadata: HashMap::new(),
                    });
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                "element_id"
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
                        } else {
                            return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Element with text '{}' not found", target_text), "success": false }),
                                error: Some(format!(
                                    "Element with text '{}' not found",
                                    target_text
                                )),
                                metadata: HashMap::new(),
                            });
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
                "text"
            } else {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Invalid target format for ui_type - need coordinates, element_id, or text", "success": false }),
                    error: Some(
                        "Invalid target format for ui_type - need coordinates, element_id, or text"
                            .to_string(),
                    ),
                    metadata: HashMap::new(),
                });
            };

            let mut keyboard = KeyboardSimulator::new()
                .map_err(|e| anyhow!("Failed to create keyboard simulator: {}", e))?;
            let send_result = keyboard.send_text(text).await;
            match send_result {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "action": "typed", "text": text, "target_kind": target_kind }),
                    error: None,
                    metadata: HashMap::from([("target_kind".to_string(), json!(target_kind))]),
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
