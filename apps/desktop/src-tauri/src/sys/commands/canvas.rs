//! Tauri commands for canvas/A2UI

use crate::features::canvas::{
    A2UICommand, A2UIProtocol, A2UIResponse, Bounds, Canvas, CanvasElement, CanvasManager,
    ElementStyle, Position, Size,
};
use std::sync::Arc;
use tauri::State;

pub struct CanvasStateManager {
    pub manager: Arc<CanvasManager>,
    pub a2ui: Arc<A2UIProtocol>,
}

impl Default for CanvasStateManager {
    fn default() -> Self {
        let manager = Arc::new(CanvasManager::new());
        let a2ui = Arc::new(A2UIProtocol::new(manager.clone()));
        Self { manager, a2ui }
    }
}

/// Create a new canvas
#[tauri::command]
pub fn canvas_create(
    state: State<'_, CanvasStateManager>,
    name: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    state
        .manager
        .create_canvas(&name, width.unwrap_or(800.0), height.unwrap_or(600.0))
        .map_err(|e| e.to_string())
}

/// Get a canvas by ID
#[tauri::command]
pub fn canvas_get(
    state: State<'_, CanvasStateManager>,
    id: String,
) -> Result<Option<Canvas>, String> {
    Ok(state.manager.get_canvas(&id))
}

/// List all canvases
#[tauri::command]
pub fn canvas_list(state: State<'_, CanvasStateManager>) -> Result<Vec<(String, String)>, String> {
    let canvases = state.manager.list_canvases();
    Ok(canvases.into_iter().map(|c| (c.id, c.name)).collect())
}

/// Delete a canvas
#[tauri::command]
pub fn canvas_destroy(state: State<'_, CanvasStateManager>, id: String) -> Result<bool, String> {
    state
        .manager
        .delete_canvas(&id)
        .map(|()| true)
        .map_err(|e| e.to_string())
}

/// Set active canvas
#[tauri::command]
pub fn canvas_set_active(
    state: State<'_, CanvasStateManager>,
    id: Option<String>,
) -> Result<(), String> {
    state.manager.set_active(id).map_err(|e| e.to_string())
}

/// Get active canvas
#[tauri::command]
pub fn canvas_get_active(state: State<'_, CanvasStateManager>) -> Result<Option<String>, String> {
    state.manager.get_active().map_err(|e| e.to_string())
}

/// Add element to canvas
#[tauri::command]
pub fn canvas_add_element(
    state: State<'_, CanvasStateManager>,
    canvas_id: String,
    element: CanvasElement,
) -> Result<(), String> {
    state
        .manager
        .add_element(&canvas_id, element)
        .map_err(|e| e.to_string())
}

/// Remove element from canvas
#[tauri::command]
pub fn canvas_remove_element(
    state: State<'_, CanvasStateManager>,
    canvas_id: String,
    element_id: String,
) -> Result<bool, String> {
    state
        .manager
        .remove_element(&canvas_id, &element_id)
        .map(|_| true)
        .map_err(|e| e.to_string())
}

/// Update element in canvas
#[tauri::command]
pub fn canvas_update_element(
    state: State<'_, CanvasStateManager>,
    canvas_id: String,
    element_id: String,
    updates: serde_json::Value,
) -> Result<bool, String> {
    state
        .manager
        .update_element(&canvas_id, &element_id, |element| {
            // Update bounds if provided
            if let Some(x) = updates.get("x").and_then(|v| v.as_f64()) {
                element.bounds_mut().position.x = x;
            }
            if let Some(y) = updates.get("y").and_then(|v| v.as_f64()) {
                element.bounds_mut().position.y = y;
            }
            if let Some(width) = updates.get("width").and_then(|v| v.as_f64()) {
                element.bounds_mut().size.width = width;
            }
            if let Some(height) = updates.get("height").and_then(|v| v.as_f64()) {
                element.bounds_mut().size.height = height;
            }

            // Update content for text elements
            if let Some(content) = updates.get("content").and_then(|v| v.as_str()) {
                if let CanvasElement::Text {
                    content: ref mut c, ..
                } = element
                {
                    *c = content.to_string();
                } else if let CanvasElement::Markdown {
                    content: ref mut c, ..
                } = element
                {
                    *c = content.to_string();
                } else if let CanvasElement::Code {
                    content: ref mut c, ..
                } = element
                {
                    *c = content.to_string();
                }
            }
        })
        .map(|_| true)
        .map_err(|e| e.to_string())
}

/// Clear all elements from canvas
#[tauri::command]
pub fn canvas_clear(state: State<'_, CanvasStateManager>, canvas_id: String) -> Result<(), String> {
    state
        .manager
        .clear_canvas(&canvas_id)
        .map_err(|e| e.to_string())
}

/// Export canvas to JSON
#[tauri::command]
pub fn canvas_export(
    state: State<'_, CanvasStateManager>,
    canvas_id: String,
) -> Result<String, String> {
    let canvas = state
        .manager
        .get_canvas(&canvas_id)
        .ok_or_else(|| format!("Canvas not found: {}", canvas_id))?;

    serde_json::to_string_pretty(&canvas).map_err(|e| e.to_string())
}

/// Execute A2UI command from AGI
#[tauri::command]
pub fn canvas_a2ui_execute(
    state: State<'_, CanvasStateManager>,
    command: A2UICommand,
) -> Result<A2UIResponse, String> {
    Ok(state.a2ui.execute(command))
}

/// Add text element (convenience)
#[tauri::command]
pub fn canvas_add_text(
    state: State<'_, CanvasStateManager>,
    canvas_id: String,
    text: String,
    x: f64,
    y: f64,
    width: Option<f64>,
    style: Option<ElementStyle>,
) -> Result<String, String> {
    let element_id = uuid::Uuid::new_v4().to_string();
    let element = CanvasElement::Text {
        id: element_id.clone(),
        bounds: Bounds {
            position: Position { x, y },
            size: Size {
                width: width.unwrap_or(200.0),
                height: 50.0,
            },
        },
        content: text,
        style: style.unwrap_or_default(),
    };

    state
        .manager
        .add_element(&canvas_id, element)
        .map(|()| element_id)
        .map_err(|e| e.to_string())
}
