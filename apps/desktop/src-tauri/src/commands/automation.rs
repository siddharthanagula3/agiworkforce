use anyhow::{anyhow, Result as AnyResult};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use super::capture::{capture_screen_full, capture_screen_region};
use super::AppDatabase;
use crate::automation::screen::{perform_ocr, OcrResult};
use crate::{
    automation::{
        global_service,
        input::{KeyboardSimulator, MouseButton},
        uia::{ElementQuery, UIElementInfo},
        AutomationService,
    },
    db::{
        models::{OverlayEvent, OverlayEventType},
        repository,
    },
    overlay::{
        dispatch_overlay_animation, dispatch_overlay_animation_normalized, ensure_overlay_ready,
        OverlayAnimation,
    },
};

#[derive(Debug, Deserialize)]
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
pub struct InvokeRequest {
    pub element_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ValueRequest {
    pub element_id: String,
    pub value: String,
    #[serde(default)]
    pub focus: Option<bool>,
}

#[derive(Debug, Deserialize)]
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
pub struct OverlayClickPayload {
    pub x: i32,
    pub y: i32,
    #[serde(default = "default_left_button")]
    pub button: String,
}

#[derive(Debug, Deserialize)]
pub struct OverlayTypePayload {
    pub x: i32,
    pub y: i32,
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct OverlayRegionPayload {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Deserialize)]
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
pub struct HotkeyRequest {
    pub key: u16,
    #[serde(default)]
    pub modifiers: Vec<String>,
}

#[derive(Debug, Deserialize)]
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
pub fn automation_list_windows(app: AppHandle) -> Result<Vec<UIElementInfo>, String> {
    ensure_overlay_ready(&app);
    with_service(|service| service.uia.list_windows()).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_find_elements(
    request: FindElementsRequest,
) -> Result<Vec<UIElementInfo>, String> {
    let query = ElementQuery {
        window: request.window,
        window_class: request.window_class,
        name: request.name,
        class_name: request.class_name,
        automation_id: request.automation_id,
        control_type: request.control_type,
        max_results: request.max_results,
    };

    with_service(|service| service.uia.find_elements(request.parent_id, &query))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_invoke(request: InvokeRequest) -> Result<(), String> {
    with_service(|service| service.uia.invoke(&request.element_id)).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_set_value(request: ValueRequest) -> Result<(), String> {
    with_service(|service| {
        if request.focus.unwrap_or(false) {
            service.uia.set_focus(&request.element_id)?;
        }
        service.uia.set_value(&request.element_id, &request.value)
    })
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_get_value(element_id: String) -> Result<String, String> {
    with_service(|service| service.uia.get_value(&element_id)).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_get_text(element_id: String) -> Result<String, String> {
    automation_get_value(element_id)
}

#[tauri::command]
pub fn automation_toggle(element_id: String) -> Result<(), String> {
    with_service(|service| service.uia.toggle(&element_id)).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_focus_window(element_id: String) -> Result<(), String> {
    with_service(|service| service.uia.focus_window(&element_id)).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn automation_send_keys(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: SendKeysRequest,
) -> Result<(), String> {
    execute_text_input(&app, &db, &request, false).await
}

#[tauri::command]
pub fn automation_hotkey(request: HotkeyRequest) -> Result<(), String> {
    let modifiers: Vec<u16> = request
        .modifiers
        .iter()
        .filter_map(|name| KeyboardSimulator::modifier_key(name))
        .collect();

    with_service(|service| service.keyboard.hotkey(&modifiers, request.key))
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_click(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: ClickRequest,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    let (x, y, button_name) = with_service(|service| {
        let (x, y) = if let Some(element_id) = &request.element_id {
            let rect = service
                .uia
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
        let button = match button_name.as_str() {
            "right" => MouseButton::Right,
            "middle" => MouseButton::Middle,
            _ => MouseButton::Left,
        };

        service.mouse.click(x, y, button)?;
        Ok((x, y, button_name))
    })
    .map_err(|err| err.to_string())?;

    if let Ok(conn) = db.0.lock() {
        if let Err(err) = dispatch_overlay_animation(
            &app,
            &conn,
            OverlayAnimation::Click {
                x,
                y,
                button: button_name,
            },
        ) {
            tracing::warn!("Failed to emit click overlay animation: {err:?}");
        }
    }

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

    // Create mouse simulator outside the service to avoid async closure issues
    let mouse = crate::automation::input::MouseSimulator::new().map_err(|e| e.to_string())?;
    mouse
        .drag_and_drop(
            request.from_x,
            request.from_y,
            request.to_x,
            request.to_y,
            request.duration_ms,
        )
        .await
        .map_err(|err| err.to_string())?;

    // Emit overlay animation for drag-drop
    if let Ok(conn) = db.0.lock() {
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

    Ok(())
}

#[tauri::command]
pub fn automation_clipboard_get() -> Result<String, String> {
    with_service(|service| service.clipboard.get_text()).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn automation_clipboard_set(text: String) -> Result<(), String> {
    with_service(|service| service.clipboard.set_text(&text)).map_err(|err| err.to_string())
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
        perform_ocr(&image_path).map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub async fn automation_screenshot(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    request: ScreenshotRequest,
) -> Result<crate::commands::capture::CaptureResult, String> {
    ensure_overlay_ready(&app);

    if let Some(ref element_id) = request.element_id {
        let bounds = with_service(|service| service.uia.bounding_rect(element_id))
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

fn with_service<F, T>(operation: F) -> AnyResult<T>
where
    F: FnOnce(&mut AutomationService) -> AnyResult<T>,
{
    let mut guard = global_service()?;
    let service = guard
        .as_mut()
        .ok_or_else(|| anyhow!("Automation service unavailable"))?;
    operation(service)
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

    // Create a keyboard simulator outside the closure
    let keyboard = KeyboardSimulator::new().map_err(|e| e.to_string())?;

    let location = with_service(|service| {
        if let Some(element_id) = &element_id {
            if should_focus {
                let _ = service.uia.set_focus(element_id);
            }

            if let Some(bounds) = service.uia.bounding_rect(element_id)? {
                let x = (bounds.left + bounds.width / 2.0).round() as i32;
                let y = (bounds.top + bounds.height / 2.0).round() as i32;
                return Ok(Some((x, y)));
            }
        }

        Ok(fallback_position)
    })
    .map_err(|err| err.to_string())?;

    // Send text asynchronously outside the closure
    keyboard.send_text(&text).await.map_err(|e| e.to_string())?;

    if let Ok(conn) = db.0.lock() {
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

    Ok(())
}

#[tauri::command]
pub fn overlay_emit_click(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    payload: OverlayClickPayload,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    if let Ok(conn) = db.0.lock() {
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
    if let Ok(conn) = db.0.lock() {
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
    if let Ok(conn) = db.0.lock() {
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

#[tauri::command]
pub fn overlay_replay_recent(
    app: AppHandle,
    db: State<'_, AppDatabase>,
    limit: Option<usize>,
) -> Result<(), String> {
    ensure_overlay_ready(&app);
    let events = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        repository::list_overlay_events(&conn, None, None).map_err(|e| e.to_string())?
    };

    let limit = limit.unwrap_or(10);
    let count = events.len();
    let start = count.saturating_sub(limit);

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
    let _ = app.emit("overlay://event", animation);
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
