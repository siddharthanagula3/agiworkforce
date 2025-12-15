// Cross-platform screen/monitor information using xcap
use anyhow::{Context, Result};
use xcap::Monitor;

use super::xcap_lock::lock_xcap;

#[derive(Debug, Clone)]
pub struct ScreenInfo {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

impl ScreenInfo {
    pub fn from_monitor(monitor: &Monitor, index: usize) -> Self {
        ScreenInfo {
            id: index as u32, // xcap doesn't have built-in IDs, use index
            x: monitor.x(),
            y: monitor.y(),
            width: monitor.width(),
            height: monitor.height(),
            scale_factor: monitor.scale_factor(),
            is_primary: monitor.is_primary(),
        }
    }
}

pub fn list_displays() -> Result<Vec<ScreenInfo>> {
    let _xcap_lock = lock_xcap()?;
    let monitors = Monitor::all().context("Failed to enumerate displays")?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| ScreenInfo::from_monitor(monitor, index))
        .collect())
}
