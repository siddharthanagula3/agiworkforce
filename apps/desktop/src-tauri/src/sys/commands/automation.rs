use crate::sys::error::AGIError;
use anyhow::{anyhow, Result as AnyResult};
use enigo::Key;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::capture::{capture_screen_full, capture_screen_region};
use super::AppDatabase;
use crate::automation::screen::{perform_ocr, OcrResult};
use crate::{
    automation::{
        global_service,
        input::{KeyboardSimulator, MouseButton},
        types::{ElementQuery, UIElementInfo},
        // AutomationService, // Unused import
    },
    data::db::{
        models::{OverlayEvent, OverlayEventType},
        repository,
    },
    ui::overlay::{
        dispatch_overlay_animation, dispatch_overlay_animation_normalized, ensure_overlay_ready,
        OverlayAnimation,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindElementsRequest {
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub window: Option<String>,
    #[serde(default)]
    pub window_class: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub class_name: Option<String>,
    #[serde(default)]
    pub automation_id: Option<String>,
    #[serde(default)]
    pub control_type: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvokeRequest {
    pub element_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueRequest {
    pub element_id: String,
    pub value: String,
    #[serde(default)]
    pub focus: Option<bool>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickRequest {
    #[serde(default)]
    pub element_id: Option<String>,
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
    #[serde(default)]
    pub button: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRequest {
    #[serde(default)]
    pub element_id: Option<String>,
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub conversation_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayClickPayload {
    pub x: i32,
    pub y: i32,
    #[serde(default = "default_left_button")]
    pub button: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayTypePayload {
    pub x: i32,
    pub y: i32,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRegionPayload {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendKeysRequest {
    pub text: String,
    #[serde(default)]
    pub element_id: Option<String>,
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
    #[serde(default)]
    pub focus: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyRequest {
    pub key: u16,
    #[serde(default)]
    pub modifiers: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragDropRequest {
    pub from_x: i32,
    pub from_y: i32,
    pub to_x: i32,
    pub to_y: i32,
    #[serde(default = "default_drag_duration")]
    pub duration_ms: u32,
}

fn default_drag_duration() -> u32 {
    300
}

#[tauri::command]
pub fn automation_list_windows(app: AppHandle) -> Result<Vec<UIElementInfo>, AGIError> {
    ensure_overlay_ready(&app);
    global_service()?
        .native
        .list_windows()
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_find_elements(
    request: FindElementsRequest,
) -> Result<Vec<UIElementInfo>, AGIError> {
    let query = ElementQuery {
        window: request.window,
        window_class: request.window_class,
        name: request.name,
        class_name: request.class_name,
        automation_id: request.automation_id,
        control_type: request.control_type,
        max_results: request.max_results,
    };

    global_service()?
        .native
        .find_elements(request.parent_id, &query)
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_invoke(request: InvokeRequest) -> Result<(), AGIError> {
    global_service()?
        .native
        .invoke(&request.element_id)
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_set_value(request: ValueRequest) -> Result<(), AGIError> {
    let service = global_service()?;
    if request.focus.unwrap_or(false) {
        service
            .native
            .set_focus(&request.element_id)
            .map_err(AGIError::from)?;
    }
    service
        .native
        .set_value(&request.element_id, &request.value)
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_get_value(element_id: String) -> Result<String, AGIError> {
    global_service()?
        .native
        .get_value(&element_id)
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_get_text(element_id: String) -> Result<String, AGIError> {
    automation_get_value(element_id)
}

#[tauri::command]
pub fn automation_toggle(element_id: String) -> Result<(), AGIError> {
    global_service()?
        .native
        .toggle(&element_id)
        .map_err(AGIError::from)
}

#[tauri::command]
pub fn automation_focus_window(element_id: String) -> Result<(), AGIError> {
    global_service()?
        .native
        .focus_window(&element_id)
        .map_err(AGIError::from)
}

#[tauri::command]
pub async fn automation_send_keys(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: SendKeysRequest,
) -> Result<(), String> {
    if request.text.is_empty() {
        return Err("Text cannot be empty".to_string());
    }
    if request.text.len() > 100_000 {
        return Err(format!(
            "Text too long: {} characters. Maximum is 100,000",
            request.text.len()
        ));
    }

    if let (Some(x), Some(y)) = (request.x, request.y) {
        if !(-10_000..=100_000).contains(&x) {
            return Err(format!(
                "Invalid x coordinate: {}. Must be between -10,000 and 100,000",
                x
            ));
        }
        if !(-10_000..=100_000).contains(&y) {
            return Err(format!(
                "Invalid y coordinate: {}. Must be between -10,000 and 100,000",
                y
            ));
        }
    }

    execute_text_input(&app, &db, &request, false).await
}

#[tauri::command]
pub async fn automation_hotkey(request: HotkeyRequest) -> Result<(), String> {
    let modifiers: Vec<Key> = request
        .modifiers
        .iter()
        .filter_map(|name| KeyboardSimulator::modifier_key(name))
        .collect();

    let key = KeyboardSimulator::vk_to_key(request.key)
        .ok_or_else(|| format!("Unsupported key code: {}", request.key))?;

    let service = global_service().map_err(|e| e.to_string())?;
    let mut keyboard = service.keyboard.lock().await;

    keyboard
        .send_hotkey(&modifiers, key)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn automation_click(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: ClickRequest,
) -> Result<(), String> {
    ensure_overlay_ready(&app);

    if let (Some(x), Some(y)) = (request.x, request.y) {
        if !(-10_000..=100_000).contains(&x) {
            return Err(format!(
                "Invalid x coordinate: {}. Must be between -10,000 and 100,000",
                x
            ));
        }
        if !(-10_000..=100_000).contains(&y) {
            return Err(format!(
                "Invalid y coordinate: {}. Must be between -10,000 and 100,000",
                y
            ));
        }
    }

    let service = global_service().map_err(|e| e.to_string())?;

    let setup = (|| -> AnyResult<(i32, i32, String)> {
        let (x, y) = if let Some(element_id) = &request.element_id {
            let rect = service
                .native
                .bounding_rect(element_id)?
                .ok_or_else(|| anyhow!("Element {element_id} has no bounding rectangle"))?;
            let x = (rect.left + rect.width / 2.0).round() as i32;
            let y = (rect.top + rect.height / 2.0).round() as i32;
            (x, y)
        } else if let (Some(x), Some(y)) = (request.x, request.y) {
            (x, y)
        } else {
            return Err(anyhow!("Either element_id or (x, y) must be provided"));
        };

        let button_name = request.button.as_deref().unwrap_or("left").to_lowercase();
        Ok((x, y, button_name))
    })();

    let (x, y, button_name) = match setup {
        Ok(val) => val,
        Err(err) => {
            let err_str = err.to_string();
            emit_ui_action(
                &app,
                "UI Click",
                &format!("Failed to prepare click: {}", err_str),
                "failed",
                json!(request),
                Some(err_str.clone()),
            );
            return Err(err_str);
        }
    };

    {
        let mut mouse = service.mouse.lock().await;

        let button = match button_name.as_str() {
            "right" => MouseButton::Right,
            "middle" => MouseButton::Middle,
            _ => MouseButton::Left,
        };

        if let Err(err) = mouse.click(x, y, button) {
            let err_str = err.to_string();
            emit_ui_action(
                &app,
                "UI Click",
                &format!("Failed to click: {}", err_str),
                "failed",
                json!({
                    "elementId": request.element_id,
                    "x": request.x,
                    "y": request.y,
                    "button": request.button
                }),
                Some(err_str.clone()),
            );
            return Err(err_str);
        }
    }

    if let Ok(conn) = db.conn.lock() {
        if let Err(err) = dispatch_overlay_animation(
            &app,
            &conn,
            OverlayAnimation::Click {
                x,
                y,
                button: button_name.clone(),
            },
        ) {
            tracing::warn!("Failed to emit click overlay animation: {err:?}");
        }
    }

    emit_ui_action(
        &app,
        "UI Click",
        &format!("Clicked at ({}, {}) with {}", x, y, button_name),
        "success",
        json!({
            "elementId": request.element_id,
            "x": x,
            "y": y,
            "button": button_name,
        }),
        None,
    );

    Ok(())
}

#[tauri::command]
pub async fn automation_type(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: SendKeysRequest,
) -> Result<(), String> {
    execute_text_input(&app, &db, &request, true).await
}

#[tauri::command]
pub async fn automation_drag_drop(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: DragDropRequest,
) -> Result<(), String> {
    ensure_overlay_ready(&app);

    if request.from_x < -10_000 || request.from_x > 100_000 {
        return Err(format!(
            "Invalid from_x coordinate: {}. Must be between -10,000 and 100,000",
            request.from_x
        ));
    }
    if request.from_y < -10_000 || request.from_y > 100_000 {
        return Err(format!(
            "Invalid from_y coordinate: {}. Must be between -10,000 and 100,000",
            request.from_y
        ));
    }
    if request.to_x < -10_000 || request.to_x > 100_000 {
        return Err(format!(
            "Invalid to_x coordinate: {}. Must be between -10,000 and 100,000",
            request.to_x
        ));
    }
    if request.to_y < -10_000 || request.to_y > 100_000 {
        return Err(format!(
            "Invalid to_y coordinate: {}. Must be between -10,000 and 100,000",
            request.to_y
        ));
    }

    if request.duration_ms == 0 {
        return Err("Duration must be greater than 0".to_string());
    }
    if request.duration_ms > 60_000 {
        return Err(format!(
            "Duration too long: {}ms. Maximum is 60 seconds (60,000ms)",
            request.duration_ms
        ));
    }

    let service = global_service().map_err(|e| e.to_string())?;
    let mut mouse = service.mouse.lock().await;

    if let Err(err) = mouse
        .drag_and_drop(
            request.from_x,
            request.from_y,
            request.to_x,
            request.to_y,
            request.duration_ms,
        )
        .await
    {
        let message = err.to_string();
        emit_ui_action(
            &app,
            "Drag && Drop",
            &format!("Failed to drag and drop: {}", message),
            "failed",
            json!({
                "from": { "x": request.from_x, "y": request.from_y },
                "to": { "x": request.to_x, "y": request.to_y },
                "durationMs": request.duration_ms,
            }),
            Some(message.clone()),
        );
        return Err(message);
    }

    {
        let conn = db.connection()?;
        if let Err(err) = dispatch_overlay_animation(
            &app,
            &conn,
            OverlayAnimation::RegionHighlight {
                x: request.from_x.min(request.to_x),
                y: request.from_y.min(request.to_y),
                width: (request.to_x - request.from_x).abs(),
                height: (request.to_y - request.from_y).abs(),
            },
        ) {
            tracing::warn!("Failed to emit drag-drop overlay animation: {err:?}");
        }
    }

    emit_ui_action(
        &app,
        "Drag && Drop",
        "Dragged item via UI automation",
        "success",
        json!({
            "from": { "x": request.from_x, "y": request.from_y },
            "to": { "x": request.to_x, "y": request.to_y },
            "durationMs": request.duration_ms,
        }),
        None,
    );

    Ok(())
}

#[tauri::command]
pub async fn automation_clipboard_get() -> Result<String, String> {
    let service = global_service().map_err(|e| e.to_string())?;
    let mut clipboard = service.clipboard.lock().await;
    clipboard.get_text().map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn automation_clipboard_set(text: String) -> Result<(), String> {
    if text.len() > 10_000_000 {
        return Err(format!(
            "Clipboard text too large: {} characters. Maximum is 10MB",
            text.len()
        ));
    }

    let service = global_service().map_err(|e| e.to_string())?;
    let mut clipboard = service.clipboard.lock().await;
    clipboard
        .set_text(&text)
        .map_err(|err| format!("Failed to set clipboard text: {}", err))
}

#[tauri::command]
pub async fn automation_ocr(image_path: String) -> Result<OcrResult, String> {
    #[cfg(feature = "ocr")]
    {
        perform_ocr(&image_path)
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(feature = "ocr"))]
    {
        perform_ocr(&image_path)
            .await
            .map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub async fn automation_screenshot(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: ScreenshotRequest,
) -> Result<crate::sys::commands::capture::CaptureResult, String> {
    ensure_overlay_ready(&app);

    if let Some(width) = request.width {
        if width == 0 {
            return Err("Width must be greater than 0".to_string());
        }
        if width > 20_000 {
            return Err(format!(
                "Width too large: {}. Maximum is 20,000 pixels",
                width
            ));
        }
    }
    if let Some(height) = request.height {
        if height == 0 {
            return Err("Height must be greater than 0".to_string());
        }
        if height > 20_000 {
            return Err(format!(
                "Height too large: {}. Maximum is 20,000 pixels",
                height
            ));
        }
    }

    if let Some(ref element_id) = request.element_id {
        let service = global_service().map_err(|e| e.to_string())?;
        let bounds = service
            .native
            .bounding_rect(element_id)
            .map_err(|err| err.to_string())?;
        if let Some(bounds) = bounds {
            let width = bounds.width.round().max(1.0) as u32;
            let height = bounds.height.round().max(1.0) as u32;
            let x = bounds.left.round() as i32;
            let y = bounds.top.round() as i32;
            return capture_screen_region(app, db, x, y, width, height, request.conversation_id)
                .await;
        }
    }

    if let (Some(x), Some(y), Some(width), Some(height)) =
        (request.x, request.y, request.width, request.height)
    {
        return capture_screen_region(app, db, x, y, width, height, request.conversation_id).await;
    }

    capture_screen_full(app, db, request.conversation_id).await
}

async fn execute_text_input(
    app: &AppHandle,
    db: &State<'_, AppDatabase>,
    request: &SendKeysRequest,
    force_focus: bool,
) -> Result<(), String> {
    ensure_overlay_ready(app);

    let text = request.text.clone();
    let element_id = request.element_id.clone();
    let fallback_position = request.x.zip(request.y);
    let should_focus = force_focus || request.focus.unwrap_or(false);

    let service = global_service().map_err(|e| e.to_string())?;

    let location = match (|| -> AnyResult<Option<(i32, i32)>> {
        if let Some(element_id) = &element_id {
            if should_focus {
                let _ = service.native.set_focus(element_id);
            }

            if let Some(bounds) = service.native.bounding_rect(element_id)? {
                let x = (bounds.left + bounds.width / 2.0).round() as i32;
                let y = (bounds.top + bounds.height / 2.0).round() as i32;
                return Ok(Some((x, y)));
            }
        }

        Ok(fallback_position)
    })() {
        Ok(value) => value,
        Err(err) => {
            emit_ui_action(
                app,
                "Type Text",
                &format!("Failed to locate target: {}", err),
                "failed",
                json!({
                    "elementId": element_id,
                    "textLength": text.chars().count(),
                    "forcedFocus": should_focus,
                }),
                Some(err.to_string()),
            );
            return Err(err.to_string());
        }
    };

    let mut keyboard = service.keyboard.lock().await;

    if let Err(err) = keyboard.send_text(&text).await {
        let error_string = err.to_string();
        emit_ui_action(
            app,
            "Type Text",
            &format!("Typing failed: {}", error_string),
            "failed",
            json!({
                "elementId": element_id,
                "textLength": text.chars().count(),
                "forcedFocus": should_focus,
            }),
            Some(error_string.clone()),
        );
        return Err(error_string);
    }

    {
        let conn = db.connection()?;
        if let Err(err) = dispatch_overlay_animation(
            app,
            &conn,
            OverlayAnimation::Type {
                x: location.map(|(x, _)| x).unwrap_or(0),
                y: location.map(|(_, y)| y).unwrap_or(0),
                text: text.chars().take(32).collect(),
            },
        ) {
            tracing::warn!("Failed to emit typing overlay animation: {err:?}");
        }
    }

    emit_ui_action(
        app,
        "Type Text",
        "Typed text via automation",
        "success",
        json!({
            "elementId": element_id,
            "textLength": text.chars().count(),
            "forcedFocus": should_focus,
        }),
        None,
    );

    Ok(())
}

fn emit_ui_action(
    app: &AppHandle,
    title: &str,
    description: &str,
    status: &str,
    metadata: serde_json::Value,
    error: Option<String>,
) {
    let action_id = Uuid::new_v4().to_string();
    let payload = json!({
        "action": {
            "id": action_id,
            "actionId": action_id,
            "workflowHash": serde_json::Value::Null,
            "type": "ui",
            "title": title,
            "description": description,
            "status": status,
            "requiresApproval": false,
            "scope": {
                "type": "ui",
                "description": description,
            },
            "metadata": metadata,
            "error": error,
        }
    });

    if let Err(err) = app.emit("agent:action_update", payload) {
        tracing::warn!("Failed to emit UI automation action: {}", err);
    }
}

#[tauri::command]
pub fn overlay_emit_click(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    payload: OverlayClickPayload,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    if let Ok(conn) = db.conn.lock() {
        dispatch_overlay_animation_normalized(
            &app,
            &conn,
            OverlayAnimation::Click {
                x: payload.x,
                y: payload.y,
                button: payload.button,
            },
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn overlay_emit_type(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    payload: OverlayTypePayload,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    if let Ok(conn) = db.conn.lock() {
        dispatch_overlay_animation_normalized(
            &app,
            &conn,
            OverlayAnimation::Type {
                x: payload.x,
                y: payload.y,
                text: payload.text,
            },
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn overlay_emit_region(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    payload: OverlayRegionPayload,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    if let Ok(conn) = db.conn.lock() {
        dispatch_overlay_animation_normalized(
            &app,
            &conn,
            OverlayAnimation::RegionHighlight {
                x: payload.x,
                y: payload.y,
                width: payload.width,
                height: payload.height,
            },
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// AUDIT-004-001 fix: Updated to use paginated overlay events query.
/// Maximum events to replay to prevent unbounded memory usage.
const MAX_REPLAY_EVENTS: i64 = 100;

#[tauri::command]
pub async fn overlay_replay_recent(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    limit: Option<usize>,
) -> Result<(), String> {
    ensure_overlay_ready(&app);

    // AUDIT-004-001: Use paginated query with explicit limit
    let replay_limit = limit.unwrap_or(10).min(MAX_REPLAY_EVENTS as usize) as i64;

    let paginated_result = {
        let conn = db.connection()?;
        // Request only the events we need, starting from the most recent
        // Note: list_overlay_events returns events in ASC order by timestamp,
        // so we fetch a reasonable batch and take from the end
        repository::list_overlay_events(&conn, None, None, MAX_REPLAY_EVENTS, None)
            .map_err(|e| e.to_string())?
    };

    let events = paginated_result.events;
    let count = events.len();
    let start = count.saturating_sub(replay_limit as usize);

    for event in events.into_iter().skip(start) {
        if let Some(animation) = animation_from_event(event) {
            emit_overlay(&app, &animation);
        }
    }

    Ok(())
}

fn default_left_button() -> String {
    "left".to_string()
}

fn emit_overlay(app: &AppHandle, animation: &OverlayAnimation) {
    let _ = app.emit(animation.event_name(), animation);
    let _ = app.emit("overlay:animation", animation);
}

fn animation_from_event(event: OverlayEvent) -> Option<OverlayAnimation> {
    match event.event_type {
        OverlayEventType::ScreenshotFlash => Some(OverlayAnimation::ScreenshotFlash),
        _ => event
            .data
            .as_deref()
            .and_then(|json| serde_json::from_str::<OverlayAnimation>(json).ok()),
    }
}
