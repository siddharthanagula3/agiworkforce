mod capture;
mod dxgi;
#[cfg(feature = "ocr")]
mod ocr;
mod xcap_lock;

#[cfg(test)]
mod tests;

#[cfg(not(feature = "ocr"))]
use anyhow::anyhow;

pub use capture::{
    capture_primary_screen, capture_region, capture_window, create_thumbnail, enumerate_windows,
    paste_from_clipboard, CapturedImage, CapturedRegion, WindowInfo, WindowRect,
};
pub use dxgi::{list_displays, ScreenInfo};

#[cfg(feature = "ocr")]
pub use ocr::{perform_ocr, OcrResult, OcrWord};

/// A single word recognized by OCR with its bounding box (non-OCR stub).
#[cfg(not(feature = "ocr"))]
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrWord {
    pub text: String,
    pub confidence: f32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[cfg(not(feature = "ocr"))]
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
    pub words: Vec<OcrWord>,
}

#[cfg(not(feature = "ocr"))]
pub async fn perform_ocr(_path: &str) -> anyhow::Result<OcrResult> {
    Err(anyhow!("Text recognition is not available in this version"))
}
