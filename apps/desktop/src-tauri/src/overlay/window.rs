use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

/// Ensure the transparent overlay compositor is available so automation cues can render globally.
pub fn ensure_overlay_ready(app: &AppHandle) {
    if app.get_webview_window("overlay").is_some() {
        return;
    }

    let (origin, size) = compute_overlay_bounds(app);
    let width = size.width.max(1.0);
    let height = size.height.max(1.0);

    let builder = WebviewWindowBuilder::new(
        app,
        "overlay",
        WebviewUrl::App("index.html?mode=overlay".into()),
    )
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .fullscreen(false)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .focused(false)
    .inner_size(width, height)
    .position(origin.x, origin.y);

    match builder.build() {
        Ok(window) => {
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_always_on_top(true);
            #[cfg(target_os = "windows")]
            let _ = window.set_skip_taskbar(true);
            let _ = window.show();
        }
        Err(err) => {
            tracing::warn!(?err, "Failed to initialise overlay window");
        }
    }
}

fn compute_overlay_bounds(app: &AppHandle) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    if let Ok(monitors) = app.available_monitors() {
        if !monitors.is_empty() {
            let mut min_x = f64::MAX;
            let mut min_y = f64::MAX;
            let mut max_x = f64::MIN;
            let mut max_y = f64::MIN;

            for monitor in monitors {
                let scale = monitor.scale_factor();
                let logical_pos: LogicalPosition<f64> = monitor.position().to_logical(scale);
                let logical_size: LogicalSize<f64> = monitor.size().to_logical(scale);

                min_x = min_x.min(logical_pos.x);
                min_y = min_y.min(logical_pos.y);
                max_x = max_x.max(logical_pos.x + logical_size.width);
                max_y = max_y.max(logical_pos.y + logical_size.height);
            }

            if min_x.is_finite() && min_y.is_finite() && max_x.is_finite() && max_y.is_finite() {
                let width = (max_x - min_x).max(1.0);
                let height = (max_y - min_y).max(1.0);
                return (
                    LogicalPosition::new(min_x, min_y),
                    LogicalSize::new(width, height),
                );
            }
        }
    }

    if let Ok(Some(primary)) = app.primary_monitor() {
        let scale = primary.scale_factor();
        let position = primary.position().to_logical(scale);
        let size = primary.size().to_logical(scale);
        return (position, size);
    }

    (
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(1920.0, 1080.0),
    )
}
