//! UI automation executor.
//!
//! Handles UI automation operations including screenshots, clicking,
//! and typing into UI elements. The automation service behind the native
//! mouse, keyboard, and accessibility operations is looked up when a step
//! needs it, so a goal that never controls the desktop never asks for the
//! permission that service requires.

use super::{ExecutorContext, ToolExecutor};
use crate::automation::computer_use::{
    app_argument, click_in_app, element_in_gated_app, focus_window_in_app, toggle_in_app,
    type_in_app, ActedOn, UiTarget, APP_REQUIRED,
};
use crate::automation::input::MouseButton;
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;

pub const TARGET_PARAMETER: &str = "target";
pub const ELEMENT_ID_KEY: &str = "element_id";
pub const WINDOW_KEY: &str = "window";

const MISSING_TARGET: &str = "Missing target parameter";
const MISSING_ELEMENT_ID: &str = "Missing 'element_id' in target";
const MISSING_WINDOW: &str = "Missing 'window' in target";
const APP_HANDLE_REQUIRED: &str = "Clicking and typing need the desktop app handle";
const TOGGLED_ACTION: &str = "toggled";
const FOCUSED_ACTION: &str = "focused";
const SCROLLED_ACTION: &str = "scrolled";
const READ_ACTION: &str = "read";

/// Executor for UI automation operations.
///
/// Provides tools for:
/// - `ui_screenshot`: Capture screen and emit screenshot event
/// - `ui_click`: Click by coordinates, element_id, or text
/// - `ui_type`: Type text with optional element targeting
/// - `ui_toggle`: Flip a toggleable element through the accessibility service
/// - `ui_focus_window`: Bring a window to the front by the token the platform
///   accessibility service addresses it with
/// - `ui_scroll`: Scroll a named element into view
/// - `ui_read_value`: Read an element's value back
/// - `image_ocr`: Perform OCR on an image
pub struct UiExecutor;

impl UiExecutor {
    /// Create a new UI executor.
    pub fn new() -> Self {
        Self
    }
}

impl Default for UiExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for UiExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "ui_screenshot",
            "ui_click",
            "ui_type",
            "ui_toggle",
            "ui_focus_window",
            "ui_scroll",
            "ui_read_value",
            "image_ocr",
        ]
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
            "ui_toggle" => self.execute_toggle(parameters, context).await,
            "ui_focus_window" => self.execute_focus_window(parameters, context).await,
            "ui_scroll" => self.execute_scroll(parameters, context).await,
            "ui_read_value" => self.execute_read_value(parameters, context).await,
            "image_ocr" => self.execute_ocr(parameters, context).await,
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

        let screenshot_path =
            crate::automation::computer_use::capture_to_disk("screenshot", || {
                Ok(capture_primary_screen()?.pixels)
            })
            .map_err(|e| anyhow!("Screenshot not saved: {e}"))?;

        context.emit_progress("Screenshot saved", Some(0.5));

        // Emit screenshot event for UI with base64 encoded image
        if let Some(ref app_handle) = context.app_handle {
            let image_bytes = std::fs::read(&screenshot_path)
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

        Ok(json!({ "screenshot_path": screenshot_path.to_string_lossy().to_string() }))
    }

    /// Clicks in the app named by `app`, after the same consent, per-app,
    /// activation and target-process checks the chat tool passes.
    async fn execute_click(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let (handle, app_query, target) = desktop_request(parameters, context)?;
        context.emit_progress(&format!("Clicking in '{app_query}'..."), Some(0.3));

        let acted_on = click_in_app(
            handle,
            app_query,
            &target,
            MouseButton::Left,
            Some(context.session_id.as_str()),
        )
        .await
        .map_err(|refusal| anyhow!(refusal))?;

        context.emit_progress("Click completed", Some(1.0));
        Ok(acted_on_json(
            match target {
                UiTarget::Coordinates { .. } => "clicked",
                _ => "invoked",
            },
            &acted_on,
        ))
    }

    async fn execute_type(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let (handle, app_query, target) = desktop_request(parameters, context)?;
        let text = parameters
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing text parameter"))?;
        context.emit_progress(&format!("Typing in '{app_query}'..."), Some(0.3));

        let acted_on = type_in_app(
            handle,
            app_query,
            &target,
            text,
            Some(context.session_id.as_str()),
        )
        .await
        .map_err(|refusal| anyhow!(refusal))?;

        context.emit_progress("Text typed successfully", Some(1.0));
        let mut typed = acted_on_json("typed", &acted_on);
        typed["text"] = json!(text);
        Ok(typed)
    }

    async fn execute_toggle(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let element_id = target_element_id(parameters)?;
        let handle = context
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!(APP_HANDLE_REQUIRED))?;
        let app_query = app_argument(parameters).ok_or_else(|| anyhow!(APP_REQUIRED))?;

        context.emit_progress(&format!("Toggling element '{}'...", element_id), Some(0.5));

        let acted_on = toggle_in_app(
            handle,
            app_query,
            element_id,
            Some(context.session_id.as_str()),
        )
        .await
        .map_err(|refusal| anyhow!(refusal))?;

        Ok(acted_on_json(TOGGLED_ACTION, &acted_on))
    }

    async fn execute_focus_window(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let window = target_window(parameters)?;
        let (handle, app_query) = named_app(parameters, context)?;

        context.emit_progress(&format!("Focusing window '{}'...", window), Some(0.5));

        let acted_on =
            focus_window_in_app(handle, app_query, window, Some(context.session_id.as_str()))
                .await
                .map_err(|refusal| anyhow!(refusal))?;

        let mut focused = acted_on_json(FOCUSED_ACTION, &acted_on);
        focused["window"] = json!(window);
        Ok(focused)
    }

    async fn execute_scroll(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let element_id = target_element_id(parameters)?;
        let (handle, app_query) = named_app(parameters, context)?;
        element_in_gated_app(
            handle,
            app_query,
            element_id,
            Some(context.session_id.as_str()),
        )
        .await
        .map_err(|refusal| anyhow!(refusal))?;

        context.emit_progress(&format!("Scrolling to '{}'...", element_id), Some(0.5));

        Self::scroll_to(handle, element_id)
            .map_err(|e| anyhow!("Failed to scroll to element '{}': {}", element_id, e))?;

        Ok(json!({ "success": true, "action": SCROLLED_ACTION, "element_id": element_id }))
    }

    #[cfg(windows)]
    fn scroll_to(handle: &tauri::AppHandle, element_id: &str) -> Result<()> {
        crate::automation::shared_service(handle)
            .map_err(|unavailable| anyhow!(unavailable))?
            .native
            .scroll_to_element(element_id)
    }

    /// Only the Windows automation service exposes a scroll pattern. The action
    /// router declines this verb before dispatch on every other platform, so
    /// reaching here means the tier was bypassed and the honest answer is that
    /// the service cannot do it.
    #[cfg(not(windows))]
    fn scroll_to(_handle: &tauri::AppHandle, _element_id: &str) -> Result<()> {
        Err(anyhow!(
            crate::automation::ACCESSIBILITY_UNSUPPORTED_PLATFORM
        ))
    }

    async fn execute_read_value(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let element_id = target_element_id(parameters)?;
        let (handle, app_query) = named_app(parameters, context)?;

        context.emit_progress(&format!("Reading element '{}'...", element_id), Some(0.5));

        element_in_gated_app(
            handle,
            app_query,
            element_id,
            Some(context.session_id.as_str()),
        )
        .await
        .map_err(|refusal| anyhow!(refusal))?;
        let value = crate::automation::shared_service(handle)
            .map_err(|unavailable| anyhow!(unavailable))?
            .native
            .get_value(element_id)
            .map_err(|e| anyhow!("Failed to read element '{}': {}", element_id, e))?;

        Ok(json!({
            "success": true,
            "action": READ_ACTION,
            "element_id": element_id,
            "value": value
        }))
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
    async fn execute_ocr(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let requested = parameters
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?;
        let granted = context.granted_folders().await?;
        let canonical = granted.readable_path(std::path::Path::new(requested), "image_ocr")?;
        let image_path = canonical
            .to_str()
            .ok_or_else(|| anyhow!("The path '{}' is not valid UTF-8", canonical.display()))?;

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

fn named_app<'a>(
    parameters: &'a HashMap<String, Value>,
    context: &'a ExecutorContext,
) -> Result<(&'a tauri::AppHandle, &'a str)> {
    let handle = context
        .app_handle
        .as_ref()
        .ok_or_else(|| anyhow!(APP_HANDLE_REQUIRED))?;
    let app_query = app_argument(parameters).ok_or_else(|| anyhow!(APP_REQUIRED))?;
    Ok((handle, app_query))
}

fn desktop_request<'a>(
    parameters: &'a HashMap<String, Value>,
    context: &'a ExecutorContext,
) -> Result<(&'a tauri::AppHandle, &'a str, UiTarget)> {
    let (handle, app_query) = named_app(parameters, context)?;
    let target = parameters
        .get(TARGET_PARAMETER)
        .ok_or_else(|| anyhow!(MISSING_TARGET))?;
    let target = UiTarget::parse(target).map_err(|invalid| anyhow!(invalid))?;
    Ok((handle, app_query, target))
}

fn acted_on_json(action: &str, acted_on: &ActedOn) -> Value {
    json!({
        "success": true,
        "action": action,
        "app": acted_on.app,
        "target_kind": acted_on.target_kind,
        "element_id": acted_on.element_id,
    })
}

fn target_element_id(parameters: &HashMap<String, Value>) -> Result<&str> {
    parameters
        .get(TARGET_PARAMETER)
        .ok_or_else(|| anyhow!(MISSING_TARGET))?
        .get(ELEMENT_ID_KEY)
        .and_then(|value| value.as_str())
        .ok_or_else(|| anyhow!(MISSING_ELEMENT_ID))
}

fn target_window(parameters: &HashMap<String, Value>) -> Result<&str> {
    parameters
        .get(TARGET_PARAMETER)
        .ok_or_else(|| anyhow!(MISSING_TARGET))?
        .get(WINDOW_KEY)
        .and_then(|value| value.as_str())
        .ok_or_else(|| anyhow!(MISSING_WINDOW))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parameters(target: Value) -> HashMap<String, Value> {
        HashMap::from([(TARGET_PARAMETER.to_string(), target)])
    }

    #[test]
    fn an_element_target_reads_its_identifier_back() {
        let params = parameters(json!({ ELEMENT_ID_KEY: "ax-42" }));

        assert_eq!(target_element_id(&params).expect("resolved"), "ax-42");
        assert!(target_window(&params).is_err());
    }

    #[test]
    fn a_window_target_reads_its_token_back() {
        let params = parameters(json!({ WINDOW_KEY: "Notes" }));

        assert_eq!(target_window(&params).expect("resolved"), "Notes");
        assert!(target_element_id(&params).is_err());
    }

    #[test]
    fn a_missing_target_is_an_error_rather_than_a_default() {
        let empty: HashMap<String, Value> = HashMap::new();

        assert!(target_element_id(&empty).is_err());
        assert!(target_window(&empty).is_err());
    }

    #[test]
    fn test_ui_executor_tool_names() {
        // Skip test in CI environments without display
        if std::env::var("CI").is_ok() {
            return;
        }

        let executor = UiExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"ui_screenshot"));
        assert!(names.contains(&"ui_click"));
        assert!(names.contains(&"ui_type"));
        assert!(names.contains(&"ui_toggle"));
        assert!(names.contains(&"ui_focus_window"));
        assert!(names.contains(&"ui_scroll"));
        assert!(names.contains(&"ui_read_value"));
        assert!(names.contains(&"image_ocr"));
    }

    #[test]
    fn test_ui_executor_description() {
        // Skip test in CI environments without display
        if std::env::var("CI").is_ok() {
            return;
        }

        let executor = UiExecutor::new();
        assert!(!executor.description().is_empty());
    }
}
