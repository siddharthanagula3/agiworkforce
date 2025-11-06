use crate::state::{AppState, DockPosition, WindowGeometry};
use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize,
    WebviewWindow, WindowEvent,
};
use tracing::warn;

const WINDOW_MIN_WIDTH: f64 = 360.0;
const WINDOW_MAX_WIDTH: f64 = 480.0;
const DOCK_THRESHOLD: f64 = 32.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub dock: Option<DockPosition>,
    pub pinned: bool,
    pub always_on_top: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockPreviewEvent {
    pub preview: Option<DockPosition>,
}

pub fn set_pinned(window: &WebviewWindow, app_state: &AppState, pinned: bool) -> Result<()> {
    app_state.update(|state| {
        if state.pinned != pinned {
            state.pinned = pinned;
            true
        } else {
            false
        }
    })?;
    emit_state(window, app_state)?;
    Ok(())
}

pub fn set_always_on_top(window: &WebviewWindow, app_state: &AppState, value: bool) -> Result<()> {
    window.set_always_on_top(value)?;
    app_state.update(|state| {
        if state.always_on_top != value {
            state.always_on_top = value;
            true
        } else {
            false
        }
    })?;
    emit_state(window, app_state)?;
    Ok(())
}

pub fn show_window(window: &WebviewWindow) -> Result<()> {
    window.show()?;
    window.set_focus()?;
    Ok(())
}

pub fn hide_window(window: &WebviewWindow) -> Result<()> {
    window.hide()?;
    Ok(())
}

pub fn initialize_window(window: &WebviewWindow) -> Result<()> {
    let app_state = window.state::<AppState>().clone();
    let snapshot = app_state.snapshot();

    window.set_always_on_top(snapshot.always_on_top)?;
    window.set_decorations(false)?;
    window.set_focus()?;
    window.set_title("AGI Workforce")?;

    if let Some(geometry) = snapshot.geometry.clone() {
        apply_geometry(window, &app_state, &geometry)?;
    }

    if let Some(dock) = snapshot.dock.clone() {
        apply_dock(window, &app_state, dock)?;
    }

    register_event_handlers(window, &app_state)?;

    emit_state(window, &app_state)?;
    emit_focus(window, true)?;
    Ok(())
}

pub fn apply_dock(
    window: &WebviewWindow,
    app_state: &AppState,
    position: DockPosition,
) -> Result<()> {
    let monitor = resolve_monitor(window)?;
    let scale_factor = monitor.scale_factor();
    let monitor_size = monitor.size().to_logical(scale_factor);
    let monitor_position = monitor.position().to_logical(scale_factor);

    let dock_width = WINDOW_MAX_WIDTH;
    let height = monitor_size.height;
    let x = match position {
        DockPosition::Left => monitor_position.x,
        DockPosition::Right => monitor_position.x + monitor_size.width - dock_width,
    };
    let y = monitor_position.y;

    app_state.update(|state| {
        if state.dock.is_none() {
            state.previous_geometry = state.geometry.clone();
        }

        state.dock = Some(position.clone());
        state.geometry = Some(WindowGeometry {
            x,
            y,
            width: dock_width,
            height,
        });
        true
    })?;

    app_state.suppress_events(|| {
        window.set_size(LogicalSize::<f64> {
            width: dock_width,
            height,
        })?;
        window.set_position(LogicalPosition::<f64> { x, y })
    })?;

    emit_state(window, app_state)?;
    Ok(())
}

pub fn undock(window: &WebviewWindow, app_state: &AppState) -> Result<()> {
    let previous = app_state.snapshot().previous_geometry;
    let geometry = previous.unwrap_or_default();

    app_state.update(|state| {
        state.dock = None;
        state.geometry = Some(geometry.clone());
        true
    })?;

    apply_geometry(window, app_state, &geometry)?;
    emit_state(window, app_state)?;
    Ok(())
}

// TODO: Fix lifetime issues with Tauri 2.0 event handler pattern
// fn register_event_handlers(window: WebviewWindow) {
//     let app_state = window.state::<AppState>().clone();
//     window.on_window_event(move |event| match event {
//         ...
//     });
// }

fn handle_move_event(
    window: &WebviewWindow,
    app_state: &AppState,
    position: PhysicalPosition<i32>,
) -> Result<()> {
    let monitor = resolve_monitor(window)?;
    let scale_factor = monitor.scale_factor();
    let logical_position = position.to_logical(scale_factor);
    let outer_size = window.outer_size()?.to_logical(scale_factor);

    app_state.update(|state| {
        let geometry = state.geometry.get_or_insert_with(WindowGeometry::default);
        geometry.x = logical_position.x;
        geometry.y = logical_position.y;
        geometry.width = outer_size.width;
        geometry.height = outer_size.height;
        true
    })?;

    let dock_candidate = detect_dock_candidate(&monitor, &logical_position, outer_size.width);
    match dock_candidate {
        Some(position) => {
            emit_preview(window, Some(position.clone()))?;
            if app_state.with_state(|state| state.dock.clone()) != Some(position.clone()) {
                apply_dock(window, app_state, position)?;
            }
        }
        None => {
            let already_docked = app_state.with_state(|state| state.dock.is_some());
            if already_docked {
                undock(window, app_state)?;
            } else {
                emit_state(window, app_state)?;
            }
            emit_preview(window, None)?;
        }
    }

    Ok(())
}

fn handle_resize_event(
    window: &WebviewWindow,
    app_state: &AppState,
    size: PhysicalSize<u32>,
) -> Result<()> {
    let scale_factor = window.scale_factor()?;
    let mut logical: LogicalSize<f64> = size.to_logical(scale_factor);
    let clamped_width = logical.width.clamp(WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH);

    if (clamped_width - logical.width).abs() > f64::EPSILON {
        logical.width = clamped_width;
        app_state.suppress_events(|| window.set_size(tauri::Size::Logical(logical)))?;
    }

    app_state.update(|state| {
        let geometry = state.geometry.get_or_insert_with(WindowGeometry::default);
        geometry.width = logical.width;
        geometry.height = logical.height;
        true
    })?;

    emit_state(window, app_state)?;
    Ok(())
}

fn detect_dock_candidate(
    monitor: &Monitor,
    position: &LogicalPosition<f64>,
    width: f64,
) -> Option<DockPosition> {
    let monitor_position: LogicalPosition<f64> =
        monitor.position().to_logical(monitor.scale_factor());
    let monitor_size: LogicalSize<f64> = monitor.size().to_logical(monitor.scale_factor());

    if (position.x - monitor_position.x).abs() <= DOCK_THRESHOLD {
        Some(DockPosition::Left)
    } else if ((position.x + width) - (monitor_position.x + monitor_size.width)).abs()
        <= DOCK_THRESHOLD
    {
        Some(DockPosition::Right)
    } else {
        None
    }
}

fn apply_geometry(
    window: &WebviewWindow,
    app_state: &AppState,
    geometry: &WindowGeometry,
) -> Result<()> {
    let logical_size = LogicalSize::<f64> {
        width: geometry.width.clamp(WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH),
        height: geometry.height,
    };
    let logical_position = LogicalPosition::<f64> {
        x: geometry.x,
        y: geometry.y,
    };

    app_state.suppress_events(|| {
        window.set_size(logical_size)?;
        window.set_position(logical_position)
    })?;

    Ok(())
}

fn resolve_monitor(window: &WebviewWindow) -> Result<Monitor> {
    if let Some(monitor) = window.current_monitor()? {
        return Ok(monitor);
    }
    if let Some(monitor) = window.primary_monitor()? {
        return Ok(monitor);
    }
    let mut monitors = window
        .available_monitors()
        .context("failed to enumerate monitors")?;
    monitors.pop().context("no monitor information available")
}

fn emit_state(window: &WebviewWindow, app_state: &AppState) -> Result<()> {
    let current = app_state.snapshot();
    let payload = DockState {
        dock: current.dock,
        always_on_top: current.always_on_top,
        pinned: current.pinned,
    };
    window.emit("window://state", &payload)?;
    Ok(())
}

fn emit_focus(window: &WebviewWindow, focused: bool) -> Result<()> {
    window.emit("window://focus", &focused)?;
    Ok(())
}

fn emit_preview(window: &WebviewWindow, preview: Option<DockPosition>) -> Result<()> {
    let payload = DockPreviewEvent { preview };
    window.emit("window://dock-preview", &payload)?;
    Ok(())
}

fn register_event_handlers(window: &WebviewWindow, app_state: &AppState) -> Result<()> {
    let window_handle = window.clone();
    let app_state_handle = app_state.clone();

    window.on_window_event(move |event| {
        if app_state_handle.is_events_suppressed() {
            return;
        }

        match event {
            WindowEvent::Focused(focused) => {
                if let Err(err) = emit_focus(&window_handle, *focused) {
                    warn!("Failed to emit focus event: {err:?}");
                }
            }
            WindowEvent::Moved(position) => {
                if let Err(err) = handle_move_event(&window_handle, &app_state_handle, *position) {
                    warn!("Failed to handle move event: {err:?}");
                }
            }
            WindowEvent::Resized(size) => {
                if let Err(err) = handle_resize_event(&window_handle, &app_state_handle, *size) {
                    warn!("Failed to handle resize event: {err:?}");
                }
            }
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Err(err) = hide_window(&window_handle) {
                    warn!("Failed to hide window on close request: {err:?}");
                }
            }
            _ => {}
        }
    });

    Ok(())
}
