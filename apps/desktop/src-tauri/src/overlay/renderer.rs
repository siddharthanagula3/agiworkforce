use anyhow::Result;
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize};

use crate::db::{create_overlay_event, OverlayEvent, OverlayEventType};

use super::OverlayAnimation;

struct MonitorDescriptor {
    physical_position: PhysicalPosition<i32>,
    physical_size: PhysicalSize<u32>,
    logical_position: LogicalPosition<f64>,
    scale_factor: f64,
}

struct OverlaySpace {
    origin: LogicalPosition<f64>,
    monitors: Vec<MonitorDescriptor>,
}

struct NormalizedPoint {
    x: f64,
    y: f64,
    scale: f64,
}

fn serialize_animation(animation: &OverlayAnimation) -> Result<Option<String>> {
    Ok(match animation {
        OverlayAnimation::ScreenshotFlash => None,
        other => Some(serde_json::to_string(other)?),
    })
}

fn materialize_event(animation: &OverlayAnimation) -> (OverlayEventType, i32, i32) {
    match animation {
        OverlayAnimation::Click { x, y, .. } => (OverlayEventType::Click, *x, *y),
        OverlayAnimation::Type { x, y, .. } => (OverlayEventType::Type, *x, *y),
        OverlayAnimation::RegionHighlight { x, y, .. } => {
            (OverlayEventType::RegionHighlight, *x, *y)
        }
        OverlayAnimation::ScreenshotFlash => (OverlayEventType::ScreenshotFlash, 0, 0),
    }
}

/// Persist and emit an overlay animation so that the frontend can render it.
pub fn dispatch_overlay_animation(
    app: &AppHandle,
    conn: &Connection,
    animation: OverlayAnimation,
) -> Result<()> {
    dispatch_overlay_animation_internal(app, conn, animation, false)
}

/// Persist and emit an overlay animation that is already normalized to overlay space.
pub fn dispatch_overlay_animation_normalized(
    app: &AppHandle,
    conn: &Connection,
    animation: OverlayAnimation,
) -> Result<()> {
    dispatch_overlay_animation_internal(app, conn, animation, true)
}

fn dispatch_overlay_animation_internal(
    app: &AppHandle,
    conn: &Connection,
    animation: OverlayAnimation,
    coordinates_normalized: bool,
) -> Result<()> {
    let normalized = if coordinates_normalized {
        animation
    } else if let Some(space) = compute_overlay_space(app) {
        normalize_animation(animation, &space)
    } else {
        animation
    };

    let (event_type, x, y) = materialize_event(&normalized);
    let mut event = OverlayEvent::new(event_type, x, y);
    if let Some(data) = serialize_animation(&normalized)? {
        event = event.with_data(data);
    }
    let _ = create_overlay_event(conn, &event);

    // Emit both a specific topic and the generic overlay topic for convenience.
    let _ = app.emit(normalized.event_name(), &normalized);
    let _ = app.emit("overlay://event", &normalized);
    Ok(())
}

fn compute_overlay_space(app: &AppHandle) -> Option<OverlaySpace> {
    let monitors = app.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }

    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut descriptors = Vec::with_capacity(monitors.len());

    for monitor in monitors {
        let scale = monitor.scale_factor();
        let physical_position = *monitor.position();
        let physical_size = *monitor.size();
        let logical_position: LogicalPosition<f64> = physical_position.to_logical(scale);
        let logical_size: LogicalSize<f64> = physical_size.to_logical(scale);

        min_x = min_x.min(logical_position.x);
        min_y = min_y.min(logical_position.y);

        descriptors.push(MonitorDescriptor {
            physical_position,
            physical_size,
            logical_position,
            scale_factor: scale,
        });

        // The max bounds are not stored currently but validating finite values
        // here helps guard against corrupted monitor metadata.
        let _max_x = logical_position.x + logical_size.width;
        let _max_y = logical_position.y + logical_size.height;
    }

    if !min_x.is_finite() || !min_y.is_finite() {
        return None;
    }

    Some(OverlaySpace {
        origin: LogicalPosition::new(min_x, min_y),
        monitors: descriptors,
    })
}

fn normalize_animation(animation: OverlayAnimation, space: &OverlaySpace) -> OverlayAnimation {
    match animation {
        OverlayAnimation::Click { x, y, button } => {
            let normalized = space.normalize_point(x as f64, y as f64);
            OverlayAnimation::Click {
                x: round_coordinate(normalized.x),
                y: round_coordinate(normalized.y),
                button,
            }
        }
        OverlayAnimation::Type { x, y, text } => {
            let normalized = space.normalize_point(x as f64, y as f64);
            OverlayAnimation::Type {
                x: round_coordinate(normalized.x),
                y: round_coordinate(normalized.y),
                text,
            }
        }
        OverlayAnimation::RegionHighlight {
            x,
            y,
            width,
            height,
        } => {
            let normalized = space.normalize_point(x as f64, y as f64);
            let width_logical = (width as f64 / normalized.scale).max(0.0);
            let height_logical = (height as f64 / normalized.scale).max(0.0);
            OverlayAnimation::RegionHighlight {
                x: round_coordinate(normalized.x),
                y: round_coordinate(normalized.y),
                width: round_coordinate(width_logical),
                height: round_coordinate(height_logical),
            }
        }
        OverlayAnimation::ScreenshotFlash => OverlayAnimation::ScreenshotFlash,
    }
}

fn round_coordinate(value: f64) -> i32 {
    value.round().clamp(i32::MIN as f64, i32::MAX as f64) as i32
}

impl OverlaySpace {
    fn normalize_point(&self, x: f64, y: f64) -> NormalizedPoint {
        let descriptor = self
            .resolve_monitor(x, y)
            .unwrap_or_else(|| &self.monitors[0]);

        let left = descriptor.physical_position.x as f64;
        let top = descriptor.physical_position.y as f64;

        let relative_x = x - left;
        let relative_y = y - top;

        let logical_x = descriptor.logical_position.x + relative_x / descriptor.scale_factor;
        let logical_y = descriptor.logical_position.y + relative_y / descriptor.scale_factor;

        NormalizedPoint {
            x: logical_x - self.origin.x,
            y: logical_y - self.origin.y,
            scale: descriptor.scale_factor,
        }
    }

    fn resolve_monitor(&self, x: f64, y: f64) -> Option<&MonitorDescriptor> {
        self.monitors.iter().find(|descriptor| {
            let left = descriptor.physical_position.x as f64;
            let top = descriptor.physical_position.y as f64;
            let right = left + descriptor.physical_size.width as f64;
            let bottom = top + descriptor.physical_size.height as f64;

            x >= left && x <= right && y >= top && y <= bottom
        })
    }
}
