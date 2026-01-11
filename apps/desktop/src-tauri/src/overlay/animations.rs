use serde::{Deserialize, Serialize};

/// Describes a visual overlay animation that should be rendered on the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OverlayAnimation {
    Click {
        x: i32,
        y: i32,
        button: String,
    },
    Type {
        x: i32,
        y: i32,
        text: String,
    },
    RegionHighlight {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    },
    ScreenshotFlash,
}

impl OverlayAnimation {
    pub fn event_name(&self) -> &'static str {
        match self {
            OverlayAnimation::Click { .. } => "overlay://click",
            OverlayAnimation::Type { .. } => "overlay://type",
            OverlayAnimation::RegionHighlight { .. } => "overlay://region",
            OverlayAnimation::ScreenshotFlash => "overlay://flash",
        }
    }
}
