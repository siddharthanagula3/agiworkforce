use crate::state::{AppState, DockPosition, WindowGeometry};
use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize,
    WebviewWindow, WindowEvent,
};
use tracing::warn;

const WINDOW_MIN_WIDTH: f64 = 1000.0;
const WINDOW_DEFAULT_WIDTH: f64 = 1400.0;
const WINDOW_DEFAULT_HEIGHT: f64 = 850.0; // Conservative to avoid taskbar overlap
const WINDOW_DEFAULT_MAX_WIDTH: f64 = 480.0; // Used for docking only
const DOCK_THRESHOLD: f64 = 32.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub dock: Option<DockPosition>,
    pub pinned: bool,
    pub always_on_top: bool,
    pub maximized: bool,
    pub fullscreen: bool,
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

    // Get monitor to account for taskbar
    let monitor = resolve_monitor(window)?;
    let scale_factor = monitor.scale_factor();
    let monitor_size = monitor.size().to_logical(scale_factor);
    let monitor_position = monitor.position().to_logical(scale_factor);
    
    // Get the actual work area (excluding taskbar) using Tauri's available_monitors
    // This provides the actual usable screen area
    let work_area = if let Ok(monitors) = window.available_monitors() {
        if let Some(current_monitor) = monitors.into_iter().find(|m| {
            let pos = m.position();
            let size = m.size();
            pos.x <= monitor_position.x as i32 && 
            pos.y <= monitor_position.y as i32 &&
            (pos.x + size.width as i32) >= (monitor_position.x + monitor_size.width) as i32 &&
            (pos.y + size.height as i32) >= (monitor_position.y + monitor_size.height) as i32
        }) {
            // Use monitor's actual work area
            let work_size = current_monitor.size().to_logical(scale_factor);
            let work_pos = current_monitor.position().to_logical(scale_factor);
            (work_pos, work_size)
        } else {
            // Fallback with taskbar estimation
            let taskbar_height = 48.0; // Standard Windows 11 taskbar
            let available_size = LogicalSize::<f64> {
                width: monitor_size.width,
                height: monitor_size.height - taskbar_height,
            };
            (monitor_position, available_size)
        }
    } else {
        // Fallback with taskbar estimation  
        let taskbar_height = 48.0; // Standard Windows 11 taskbar
        let available_size = LogicalSize::<f64> {
            width: monitor_size.width,
            height: monitor_size.height - taskbar_height,
        };
        (monitor_position, available_size)
    };
    
    let available_position = work_area.0;
    let available_size = work_area.1;

    // Only apply saved geometry if it's valid and not docked
    let should_use_saved = if let Some(geometry) = &snapshot.geometry {
        // Validate saved geometry is reasonable
        geometry.width >= WINDOW_MIN_WIDTH
            && geometry.height >= 700.0
            && geometry.x >= available_position.x
            && geometry.y >= available_position.y
            && geometry.x + geometry.width <= available_position.x + available_size.width
            && geometry.y + geometry.height <= available_position.y + available_size.height
    } else {
        false
    };

    if snapshot.dock.is_some() {
        // If docked, apply dock
        if let Some(dock) = snapshot.dock.clone() {
            apply_dock(window, &app_state, dock)?;
        }
    } else if should_use_saved {
        // Use saved geometry if valid
        if let Some(geometry) = snapshot.geometry.clone() {
            apply_geometry(window, &app_state, &geometry)?;
        }
    } else {
        // Use default size and center on screen
        let default_width = WINDOW_DEFAULT_WIDTH.min(available_size.width * 0.9);
        let default_height = WINDOW_DEFAULT_HEIGHT.min(available_size.height * 0.9);
        let x = available_position.x + (available_size.width - default_width) / 2.0;
        let y = available_position.y + (available_size.height - default_height) / 2.0;

        let default_geometry = WindowGeometry {
            x,
            y,
            width: default_width,
            height: default_height,
        };

        app_state.update(|state| {
            state.geometry = Some(default_geometry.clone());
            true
        })?;

        apply_geometry(window, &app_state, &default_geometry)?;
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

    // Get actual work area to properly position docked windows
    let work_area = get_work_area(window, &monitor)?;
    let available_position = work_area.0;
    let available_size = work_area.1;
    
    let dock_width = WINDOW_DEFAULT_MAX_WIDTH;
    let height = available_size.height;
    let x = match position {
        DockPosition::Left => available_position.x,
        DockPosition::Right => available_position.x + available_size.width - dock_width,
    };
    let y = available_position.y;

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

    // Check if window is maximized - don't allow docking when maximized
    let is_maximized = window.is_maximized()?;

    app_state.update(|state| {
        let geometry = state.geometry.get_or_insert_with(WindowGeometry::default);
        geometry.x = logical_position.x;
        geometry.y = logical_position.y;
        geometry.width = outer_size.width;
        geometry.height = outer_size.height;
        true
    })?;

    // Skip dock detection if window is maximized
    if !is_maximized {
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
    } else {
        emit_preview(window, None)?;
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

    // Get monitor info to ensure we don't exceed work area
    let monitor = resolve_monitor(window).ok();
    let max_height = if let Some(ref m) = monitor {
        if let Ok(work_area) = get_work_area(window, m) {
            work_area.1.height
        } else {
            let monitor_size: LogicalSize<f64> = m.size().to_logical(m.scale_factor());
            monitor_size.height - 48.0 // Fallback to taskbar estimation
        }
    } else {
        f64::MAX
    };

    // Check if window is maximized - if so, don't clamp width
    let is_maximized = window.is_maximized()?;
    let is_docked = app_state.with_state(|state| state.dock.is_some());

    // Ensure height doesn't exceed work area
    if logical.height > max_height {
        logical.height = max_height;
        app_state.suppress_events(|| window.set_size(tauri::Size::Logical(logical)))?;
    }

    if !is_maximized && !is_docked {
        // Only enforce minimum width when NOT maximized and NOT docked
        if logical.width < WINDOW_MIN_WIDTH {
            logical.width = WINDOW_MIN_WIDTH;
            app_state.suppress_events(|| window.set_size(tauri::Size::Logical(logical)))?;
        }
    } else if is_docked {
        // When docked, clamp to dock width
        let clamped_width = logical
            .width
            .clamp(WINDOW_MIN_WIDTH, WINDOW_DEFAULT_MAX_WIDTH);

        if (clamped_width - logical.width).abs() > f64::EPSILON {
            logical.width = clamped_width;
            app_state.suppress_events(|| window.set_size(tauri::Size::Logical(logical)))?;
        }
    }

    // Update maximized state in AppState
    app_state.update(|state| {
        if state.maximized != is_maximized {
            state.maximized = is_maximized;
        }
        let geometry = state.geometry.get_or_insert_with(WindowGeometry::default);
        geometry.width = logical.width;
        geometry.height = logical.height.max(700.0); // Minimum height
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
    // Only clamp width if docked or if window is too small
    let is_maximized = app_state.with_state(|state| state.maximized);
    let is_docked = app_state.with_state(|state| state.dock.is_some());
    
    let width = if is_maximized {
        geometry.width
    } else if is_docked {
        // When docked, use dock width
        geometry.width.clamp(WINDOW_MIN_WIDTH, WINDOW_DEFAULT_MAX_WIDTH)
    } else {
        // When not docked, allow full width but enforce minimum
        geometry.width.max(WINDOW_MIN_WIDTH)
    };

    let logical_size = LogicalSize::<f64> {
        width,
        height: geometry.height.max(700.0), // Minimum height
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

fn get_work_area(window: &WebviewWindow, monitor: &Monitor) -> Result<(LogicalPosition<f64>, LogicalSize<f64>)> {
    let scale_factor = monitor.scale_factor();
    let monitor_size = monitor.size().to_logical(scale_factor);
    let monitor_position = monitor.position().to_logical(scale_factor);
    
    // Windows typically has taskbar at bottom, but could be at any edge
    // We'll use conservative estimates for work area
    #[cfg(target_os = "windows")]
    {
        // On Windows, we can try to detect actual taskbar height
        // Standard Windows 11 taskbar is 48 pixels, Windows 10 is 40 pixels
        let taskbar_height = 48.0;
        let available_size = LogicalSize::<f64> {
            width: monitor_size.width,
            height: monitor_size.height - taskbar_height,
        };
        Ok((monitor_position, available_size))
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // On other platforms, use the full monitor size
        Ok((monitor_position, monitor_size))
    }
}

fn emit_state(window: &WebviewWindow, app_state: &AppState) -> Result<()> {
    let current = app_state.snapshot();
    let payload = DockState {
        dock: current.dock,
        always_on_top: current.always_on_top,
        pinned: current.pinned,
        maximized: current.maximized,
        fullscreen: current.fullscreen,
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
