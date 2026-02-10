//! UI automation executor.
//!
//! Handles UI automation operations including screenshots, clicking,
//! and typing into UI elements. Uses the AutomationService for native
//! mouse, keyboard, and accessibility operations.

use super::{ExecutorContext, ToolExecutor};
use crate::automation::AutomationService;
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// Executor for UI automation operations.
///
/// Provides tools for:
/// - `ui_screenshot`: Capture screen and emit screenshot event
/// - `ui_click`: Click by coordinates, element_id, or text
/// - `ui_type`: Type text with optional element targeting
/// - `image_ocr`: Perform OCR on an image
pub struct UiExecutor {
    automation: Arc<AutomationService>,
}

impl UiExecutor {
    /// Create a new UI executor with the given automation service.
    pub fn new(automation: Arc<AutomationService>) -> Self {
        Self { automation }
    }
}

#[async_trait]
impl ToolExecutor for UiExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["ui_screenshot", "ui_click", "ui_type", "image_ocr"]
    }

    fn description(&self) -> &'static str {
        "UI automation executor for screenshots, clicking, and typing"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "ui_screenshot" => self.execute_screenshot(parameters, context).await,
            "ui_click" => self.execute_click(parameters, context).await,
            "ui_type" => self.execute_type(parameters, context).await,
            "image_ocr" => self.execute_ocr(parameters).await,
            _ => Err(anyhow!("Unknown UI tool: {}", tool_name)),
        }
    }
}

impl UiExecutor {
    /// Execute ui_screenshot operation.
    ///
    /// Captures a screenshot of the primary screen, saves it to a temp file,
    /// and emits a screenshot event with base64 encoded image data.
    ///
    /// # Parameters
    /// - `action` (optional): Description of the action being taken
    ///
    /// # Returns
    /// JSON with `screenshot_path` containing the path to the saved image.
    async fn execute_screenshot(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        use crate::automation::screen::capture_primary_screen;

        context.emit_progress("Capturing screenshot...", Some(0.1));

        let captured =
            capture_primary_screen().map_err(|e| anyhow!("Failed to capture screen: {}", e))?;

        let temp_path = std::env::temp_dir().join(format!(
            "screenshot_{}.png",
            &uuid::Uuid::new_v4().to_string()[..8]
        ));

        context.emit_progress("Saving screenshot...", Some(0.5));

        captured
            .pixels
            .save(&temp_path)
            .map_err(|e| anyhow!("Failed to save screenshot: {}", e))?;

        // Emit screenshot event for UI with base64 encoded image
        if let Some(ref app_handle) = context.app_handle {
            let image_bytes = std::fs::read(&temp_path)
                .map_err(|e| anyhow!("Failed to read screenshot file: {}", e))?;

            let image_base64 =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_bytes);

            let screenshot = crate::ui::events::Screenshot {
                id: uuid::Uuid::new_v4().to_string(),
                image_base64,
                action: parameters
                    .get("action")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                element_bounds: None,
                confidence: None,
            };

            crate::ui::events::emit_screenshot(app_handle, screenshot);
        }

        context.emit_progress("Screenshot captured", Some(1.0));

        Ok(json!({ "screenshot_path": temp_path.to_string_lossy().to_string() }))
    }

    /// Execute ui_click operation.
    ///
    /// Clicks at a specified location or on a specified UI element.
    /// Supports three targeting modes:
    /// 1. Coordinates: `{ "coordinates": { "x": 100, "y": 200 } }`
    /// 2. Element ID: `{ "element_id": "some-element-id" }`
    /// 3. Text search: `{ "text": "Button Label" }`
    ///
    /// # Parameters
    /// - `target`: Object containing one of: coordinates, element_id, or text
    ///
    /// # Returns
    /// JSON with success status and details about the click action.
    async fn execute_click(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let target = parameters
            .get("target")
            .ok_or_else(|| anyhow!("Missing target parameter"))?;

        context.emit_progress("Processing click target...", Some(0.1));

        // Handle coordinate-based click
        if let Some(coords) = target.get("coordinates") {
            // EXE-006 fix: Require explicit coordinates, don't silently default to (0,0)
            let x = coords
                .get("x")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing or invalid 'x' coordinate"))?;
            let y = coords
                .get("y")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing or invalid 'y' coordinate"))?;

            // EXE-006 fix: Validate coordinate bounds (typical screen max is 32767)
            const MAX_COORDINATE: i64 = 32767;
            if !(0..=MAX_COORDINATE).contains(&x) {
                return Err(anyhow!(
                    "X coordinate {} out of bounds (must be 0-{})",
                    x,
                    MAX_COORDINATE
                ));
            }
            if !(0..=MAX_COORDINATE).contains(&y) {
                return Err(anyhow!(
                    "Y coordinate {} out of bounds (must be 0-{})",
                    y,
                    MAX_COORDINATE
                ));
            }

            let x = x as i32;
            let y = y as i32;

            context.emit_progress(&format!("Clicking at ({}, {})...", x, y), Some(0.5));

            use crate::automation::input::MouseButton;
            let mut mouse = self.automation.mouse.lock().await;
            mouse.click(x, y, MouseButton::Left)?;

            context.emit_progress("Click completed", Some(1.0));
            return Ok(json!({ "success": true, "action": "clicked", "x": x, "y": y }));
        }

        // Handle element ID-based click (invoke via accessibility API)
        if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
            context.emit_progress(&format!("Invoking element '{}'...", element_id), Some(0.5));

            self.automation
                .native
                .invoke(element_id)
                .map_err(|e| anyhow!("Failed to invoke element '{}': {}", element_id, e))?;

            context.emit_progress("Element invoked", Some(1.0));
            return Ok(json!({ "success": true, "action": "invoked", "element_id": element_id }));
        }

        // Handle text-based element lookup and click
        if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
            context.emit_progress(
                &format!("Searching for element with text '{}'...", text),
                Some(0.3),
            );

            use crate::automation::types::ElementQuery;
            let query = ElementQuery {
                window: None,
                window_class: None,
                name: Some(text.to_string()),
                class_name: None,
                automation_id: None,
                control_type: None,
                max_results: Some(1),
            };

            let elements = self
                .automation
                .native
                .find_elements(None, &query)
                .map_err(|e| anyhow!("Failed to search for element: {}", e))?;

            if let Some(element) = elements.first() {
                context.emit_progress(
                    &format!("Found element, invoking '{}'...", element.id),
                    Some(0.7),
                );

                self.automation
                    .native
                    .invoke(&element.id)
                    .map_err(|e| anyhow!("Failed to invoke element '{}': {}", element.id, e))?;

                context.emit_progress("Element invoked", Some(1.0));
                return Ok(json!({
                    "success": true,
                    "action": "invoked",
                    "element_id": element.id,
                    "found_by": "text",
                    "text": text
                }));
            }

            return Err(anyhow!("Element with text '{}' not found", text));
        }

        Err(anyhow!(
            "Invalid target format for ui_click - need coordinates, element_id, or text"
        ))
    }

    /// Execute ui_type operation.
    ///
    /// Types text into a specified UI element or at the current cursor position.
    /// Can optionally focus an element before typing.
    ///
    /// # Parameters
    /// - `target`: Object containing one of: element_id or text (for element lookup)
    /// - `text`: The text to type
    ///
    /// # Returns
    /// JSON with success status and the typed text.
    async fn execute_type(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        // use crate::automation::input::KeyboardSimulator; // Unused

        let target = parameters
            .get("target")
            .ok_or_else(|| anyhow!("Missing target parameter"))?;
        let text = parameters
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing text parameter"))?;

        context.emit_progress("Preparing to type text...", Some(0.1));

        // Focus the target element first if specified
        if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
            context.emit_progress(&format!("Focusing element '{}'...", element_id), Some(0.2));

            self.automation
                .native
                .set_focus(element_id)
                .map_err(|e| anyhow!("Failed to focus element '{}': {}", element_id, e))?;

            // Small delay to ensure focus is registered
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
            context.emit_progress(
                &format!("Searching for element with text '{}'...", target_text),
                Some(0.2),
            );

            use crate::automation::types::ElementQuery;
            let query = ElementQuery {
                window: None,
                window_class: None,
                name: Some(target_text.to_string()),
                class_name: None,
                automation_id: None,
                control_type: None,
                max_results: Some(1),
            };

            let elements = self
                .automation
                .native
                .find_elements(None, &query)
                .map_err(|e| anyhow!("Failed to search for element: {}", e))?;

            if let Some(element) = elements.first() {
                context.emit_progress(&format!("Focusing element '{}'...", element.id), Some(0.3));

                self.automation
                    .native
                    .set_focus(&element.id)
                    .map_err(|e| anyhow!("Failed to focus element '{}': {}", element.id, e))?;

                // Small delay to ensure focus is registered
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }

        context.emit_progress("Typing text...", Some(0.5));

        // Type the text using shared keyboard simulator
        let mut keyboard = self.automation.keyboard.lock().await;

        keyboard
            .send_text(text)
            .await
            .map_err(|e| anyhow!("Failed to type text: {}", e))?;

        context.emit_progress("Text typed successfully", Some(1.0));

        Ok(json!({ "success": true, "action": "typed", "text": text }))
    }

    /// Execute image_ocr operation.
    ///
    /// Performs OCR on an image and returns the extracted text.
    ///
    /// # Parameters
    /// - `image_path`: Path to the image file to process
    ///
    /// # Returns
    /// JSON with extracted text and confidence score.
    async fn execute_ocr(&self, parameters: &HashMap<String, Value>) -> Result<Value> {
        let image_path = parameters
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?;

        use crate::automation::screen::perform_ocr;

        let ocr_result = perform_ocr(image_path)
            .await
            .map_err(|e| anyhow!("OCR failed: {}", e))?;

        Ok(json!({
            "success": true,
            "image_path": image_path,
            "text": ocr_result.text,
            "confidence": ocr_result.confidence
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_executor_tool_names() {
        // Skip test in CI environments without display
        if std::env::var("CI").is_ok() {
            return;
        }

        // Create automation service (may fail without display)
        let automation = match AutomationService::new() {
            Ok(svc) => Arc::new(svc),
            Err(_) => return, // Skip if automation unavailable
        };

        let executor = UiExecutor::new(automation);
        let names = executor.tool_names();

        assert!(names.contains(&"ui_screenshot"));
        assert!(names.contains(&"ui_click"));
        assert!(names.contains(&"ui_type"));
        assert!(names.contains(&"image_ocr"));
    }

    #[test]
    fn test_ui_executor_description() {
        // Skip test in CI environments without display
        if std::env::var("CI").is_ok() {
            return;
        }

        let automation = match AutomationService::new() {
            Ok(svc) => Arc::new(svc),
            Err(_) => return,
        };

        let executor = UiExecutor::new(automation);
        assert!(!executor.description().is_empty());
    }
}
