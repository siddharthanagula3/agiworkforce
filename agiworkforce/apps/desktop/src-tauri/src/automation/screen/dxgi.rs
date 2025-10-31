use anyhow::{Context, Result};
use screenshots::display_info::DisplayInfo;
use screenshots::Screen;

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
    pub fn from(display: DisplayInfo) -> Self {
        ScreenInfo {
            id: display.id,
            x: display.x,
            y: display.y,
            width: display.width,
            height: display.height,
            scale_factor: display.scale_factor,
            is_primary: display.is_primary,
        }
    }
}

pub fn list_displays() -> Result<Vec<ScreenInfo>> {
    let screens = Screen::all().context("Failed to enumerate displays")?;
    Ok(screens
        .into_iter()
        .map(|screen| ScreenInfo::from(screen.display_info))
        .collect())
}
