use super::*;

use crate::automation::computer_use::{
    app_argument, click_in_app, type_in_app, ActedOn, UiTarget, APP_REQUIRED,
};

/// Chat tool results reach the model as text, so a capture would arrive as a
/// file path it cannot look at. The schema is withheld from chat; this answers
/// a call that names the tool anyway, for example after `tool_search`.
const UI_SCREENSHOT_UNAVAILABLE_IN_CHAT: &str = "ui_screenshot is not available in chat: tool results reach the model as text only, so it could not see the capture. Target controls with ui_click or ui_type by their visible text instead.";

fn ui_failure(message: impl Into<String>) -> ToolResult {
    let message = message.into();
    ToolResult {
        success: false,
        data: json!({ "error": message, "success": false }),
        error: Some(message),
        metadata: HashMap::new(),
    }
}

fn ui_success(action: &str, acted_on: &ActedOn, mut data: Value) -> ToolResult {
    data["success"] = json!(true);
    data["action"] = json!(action);
    data["app"] = json!(acted_on.app);
    data["target_kind"] = json!(acted_on.target_kind);
    if let Some(element_id) = &acted_on.element_id {
        data["element_id"] = json!(element_id);
    }
    ToolResult {
        success: true,
        data,
        error: None,
        metadata: HashMap::from([("target_kind".to_string(), json!(acted_on.target_kind))]),
    }
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
    fn desktop_handle(&self) -> std::result::Result<&tauri::AppHandle, String> {
        self.app_handle
            .as_ref()
            .ok_or_else(|| "App handle not available for UI automation".to_string())
    }

    pub(super) async fn execute_ui_screenshot_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        Ok(ui_failure(UI_SCREENSHOT_UNAVAILABLE_IN_CHAT))
    }

    pub(super) async fn execute_ui_click_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let Some(app_query) = app_argument(args) else {
            return Ok(ui_failure(APP_REQUIRED));
        };
        let target = args
            .get("target")
            .ok_or_else(|| anyhow!("Missing target parameter"))?;
        let target = match UiTarget::parse(target) {
            Ok(target) => target,
            Err(invalid) => return Ok(ui_failure(invalid)),
        };
        let (button, button_name) = parse_ui_mouse_button(args)?;
        let handle = match self.desktop_handle() {
            Ok(handle) => handle,
            Err(missing) => return Ok(ui_failure(missing)),
        };

        Ok(
            match click_in_app(handle, app_query, &target, button, None).await {
                Ok(acted_on) => {
                    let mut data = json!({ "button": button_name });
                    if let UiTarget::Coordinates { x, y } = target {
                        data["x"] = json!(x);
                        data["y"] = json!(y);
                    }
                    let action = match target {
                        UiTarget::Coordinates { .. } => "clicked",
                        _ => "invoked",
                    };
                    ui_success(action, &acted_on, data)
                }
                Err(refusal) => ui_failure(refusal),
            },
        )
    }

    pub(super) async fn execute_ui_type_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let Some(app_query) = app_argument(args) else {
            return Ok(ui_failure(APP_REQUIRED));
        };
        let target = args
            .get("target")
            .ok_or_else(|| anyhow!("Missing target parameter"))?;
        let text = args
            .get("text")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("Missing text parameter"))?;
        let target = match UiTarget::parse(target) {
            Ok(target) => target,
            Err(invalid) => return Ok(ui_failure(invalid)),
        };
        let handle = match self.desktop_handle() {
            Ok(handle) => handle,
            Err(missing) => return Ok(ui_failure(missing)),
        };

        Ok(
            match type_in_app(handle, app_query, &target, text, None).await {
                Ok(acted_on) => ui_success("typed", &acted_on, json!({ "text": text })),
                Err(refusal) => ui_failure(refusal),
            },
        )
    }
}
