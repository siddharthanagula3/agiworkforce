//! Zoom functionality for detailed region inspection in Computer Use.
//!
//! This module provides the ability to capture and scale screen regions
//! for improved OCR accuracy and element detection on small UI elements.
//!
//! # Example
//!
//! ```rust,ignore
//! use agiworkforce_desktop::automation::computer_use::zoom::{
//!     ZoomAction, ZoomResult, zoom_region,
//! };
//!
//! let action = ZoomAction {
//!     region: Region { x: 100, y: 200, width: 50, height: 30 },
//!     zoom_level: ZoomLevel::X4,
//!     capture_screenshot: true,
//! };
//!
//! let result = zoom_region(&action)?;
//! // result.image_base64 contains the zoomed image
//! ```

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use image::{imageops::FilterType, DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::automation::screen::capture_region;

use super::types::ElementBounds;

/// Supported zoom levels for region inspection.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ZoomLevel {
    /// 2x magnification - good for slightly small elements.
    X2,
    /// 4x magnification - good for small text and icons.
    X4,
    /// 8x magnification - maximum detail for tiny elements.
    X8,
    /// Custom zoom level (1.0 to 16.0).
    Custom(f32),
}

impl ZoomLevel {
    /// Returns the scale factor for this zoom level.
    pub fn scale_factor(&self) -> f32 {
        match self {
            ZoomLevel::X2 => 2.0,
            ZoomLevel::X4 => 4.0,
            ZoomLevel::X8 => 8.0,
            ZoomLevel::Custom(factor) => factor.clamp(1.0, 16.0),
        }
    }

    /// Creates a zoom level from a numeric factor.
    pub fn from_factor(factor: f32) -> Self {
        let clamped = factor.clamp(1.0, 16.0);
        match clamped {
            f if (f - 2.0).abs() < 0.01 => ZoomLevel::X2,
            f if (f - 4.0).abs() < 0.01 => ZoomLevel::X4,
            f if (f - 8.0).abs() < 0.01 => ZoomLevel::X8,
            _ => ZoomLevel::Custom(clamped),
        }
    }
}

impl Default for ZoomLevel {
    fn default() -> Self {
        ZoomLevel::X2
    }
}

/// Region definition for zoom operations.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Region {
    /// X coordinate of the region's top-left corner (screen coordinates).
    pub x: i32,
    /// Y coordinate of the region's top-left corner (screen coordinates).
    pub y: i32,
    /// Width of the region in pixels.
    pub width: u32,
    /// Height of the region in pixels.
    pub height: u32,
}

impl Region {
    /// Creates a new region.
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Converts this region to ElementBounds.
    pub fn to_element_bounds(&self) -> ElementBounds {
        ElementBounds::new(self.x, self.y, self.width, self.height)
    }

    /// Creates a region from ElementBounds.
    pub fn from_element_bounds(bounds: &ElementBounds) -> Self {
        Self {
            x: bounds.left,
            y: bounds.top,
            width: bounds.width,
            height: bounds.height,
        }
    }

    /// Returns the center point of this region.
    pub fn center(&self) -> (i32, i32) {
        (
            self.x + (self.width as i32 / 2),
            self.y + (self.height as i32 / 2),
        )
    }

    /// Expands the region by a margin on all sides.
    pub fn expand(&self, margin: i32) -> Self {
        Self {
            x: self.x - margin,
            y: self.y - margin,
            width: (self.width as i32 + margin * 2).max(1) as u32,
            height: (self.height as i32 + margin * 2).max(1) as u32,
        }
    }

    /// Returns the area of this region in pixels.
    pub fn area(&self) -> u64 {
        self.width as u64 * self.height as u64
    }

    /// Validates that the region has positive dimensions.
    pub fn is_valid(&self) -> bool {
        self.width > 0 && self.height > 0
    }
}

impl From<ElementBounds> for Region {
    fn from(bounds: ElementBounds) -> Self {
        Self::from_element_bounds(&bounds)
    }
}

impl From<Region> for ElementBounds {
    fn from(region: Region) -> Self {
        region.to_element_bounds()
    }
}

/// Action to zoom into a screen region for detailed inspection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomAction {
    /// The region of the screen to zoom into.
    pub region: Region,
    /// The zoom level to apply.
    #[serde(default)]
    pub zoom_level: ZoomLevel,
    /// Whether to capture and return a screenshot of the zoomed region.
    #[serde(default = "default_capture_screenshot")]
    pub capture_screenshot: bool,
    /// Optional output path to save the zoomed image.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save_path: Option<String>,
    /// Interpolation filter to use for scaling.
    #[serde(default)]
    pub interpolation: InterpolationMethod,
}

fn default_capture_screenshot() -> bool {
    true
}

impl ZoomAction {
    /// Creates a new zoom action with default settings.
    pub fn new(region: Region, zoom_level: ZoomLevel) -> Self {
        Self {
            region,
            zoom_level,
            capture_screenshot: true,
            save_path: None,
            interpolation: InterpolationMethod::default(),
        }
    }

    /// Creates a zoom action from element bounds.
    pub fn from_bounds(bounds: ElementBounds, zoom_level: ZoomLevel) -> Self {
        Self::new(Region::from_element_bounds(&bounds), zoom_level)
    }

    /// Sets the output path for saving the zoomed image.
    pub fn with_save_path(mut self, path: impl Into<String>) -> Self {
        self.save_path = Some(path.into());
        self
    }

    /// Sets the interpolation method.
    pub fn with_interpolation(mut self, method: InterpolationMethod) -> Self {
        self.interpolation = method;
        self
    }

    /// Returns the expected output dimensions after zoom.
    pub fn output_dimensions(&self) -> (u32, u32) {
        let scale = self.zoom_level.scale_factor();
        let width = (self.region.width as f32 * scale).round() as u32;
        let height = (self.region.height as f32 * scale).round() as u32;
        (width, height)
    }

    /// Validates the zoom action parameters.
    pub fn validate(&self) -> Result<()> {
        if !self.region.is_valid() {
            return Err(anyhow!("Invalid region dimensions"));
        }

        // Check for reasonable output size (max 8K)
        let (out_width, out_height) = self.output_dimensions();
        if out_width > 7680 || out_height > 4320 {
            return Err(anyhow!(
                "Zoomed dimensions too large: {}x{}",
                out_width,
                out_height
            ));
        }

        Ok(())
    }
}

/// Interpolation method for image scaling.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterpolationMethod {
    /// Nearest neighbor - fastest, pixelated result.
    Nearest,
    /// Bilinear interpolation - good balance of speed and quality.
    #[default]
    Bilinear,
    /// Lanczos3 - highest quality, slower.
    Lanczos3,
    /// Catmull-Rom - good quality, moderate speed.
    CatmullRom,
}

impl InterpolationMethod {
    /// Converts to image crate's FilterType.
    fn to_filter_type(self) -> FilterType {
        match self {
            InterpolationMethod::Nearest => FilterType::Nearest,
            InterpolationMethod::Bilinear => FilterType::Triangle,
            InterpolationMethod::Lanczos3 => FilterType::Lanczos3,
            InterpolationMethod::CatmullRom => FilterType::CatmullRom,
        }
    }
}

/// Result of a zoom operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomResult {
    /// The zoomed image as base64-encoded PNG.
    pub image_base64: String,
    /// Width of the zoomed image.
    pub width: u32,
    /// Height of the zoomed image.
    pub height: u32,
    /// Original region that was captured.
    pub original_region: Region,
    /// Zoom level that was applied.
    pub zoom_level: ZoomLevel,
    /// Scale factor applied.
    pub scale_factor: f32,
    /// Path where image was saved (if requested).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_path: Option<String>,
    /// Time taken for the zoom operation in milliseconds.
    pub processing_time_ms: u64,
}

impl ZoomResult {
    /// Decodes the base64 image to raw bytes.
    pub fn decode_image(&self) -> Result<Vec<u8>> {
        general_purpose::STANDARD
            .decode(&self.image_base64)
            .context("Failed to decode base64 image")
    }

    /// Returns the zoomed image as an RgbaImage.
    pub fn to_rgba_image(&self) -> Result<RgbaImage> {
        let bytes = self.decode_image()?;
        let img = image::load_from_memory(&bytes).context("Failed to load image from memory")?;
        Ok(img.to_rgba8())
    }
}

/// Performs a zoom operation on a screen region.
///
/// Captures the specified region from the screen and scales it
/// according to the zoom level for detailed inspection.
///
/// # Arguments
///
/// * `action` - The zoom action specifying region, zoom level, and options
///
/// # Returns
///
/// A `ZoomResult` containing the zoomed image and metadata.
///
/// # Errors
///
/// Returns an error if:
/// - The region is invalid or outside screen bounds
/// - Screen capture fails
/// - Image processing fails
pub fn zoom_region(action: &ZoomAction) -> Result<ZoomResult> {
    let start = std::time::Instant::now();

    // Validate action parameters
    action.validate()?;

    // Capture the region from screen
    let captured = capture_region(
        action.region.x,
        action.region.y,
        action.region.width,
        action.region.height,
    )
    .context("Failed to capture screen region")?;

    // Scale the image
    let (out_width, out_height) = action.output_dimensions();
    let dynamic_image = DynamicImage::ImageRgba8(captured.pixels);
    let scaled =
        dynamic_image.resize_exact(out_width, out_height, action.interpolation.to_filter_type());

    // Encode to PNG
    let mut png_bytes = Vec::new();
    scaled
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .context("Failed to encode zoomed image")?;

    // Save to disk if requested
    let saved_path = if let Some(ref path) = action.save_path {
        scaled.save(path).context("Failed to save zoomed image")?;
        Some(path.clone())
    } else {
        None
    };

    // Convert to base64
    let image_base64 = general_purpose::STANDARD.encode(&png_bytes);

    let processing_time_ms = start.elapsed().as_millis() as u64;

    Ok(ZoomResult {
        image_base64,
        width: out_width,
        height: out_height,
        original_region: action.region,
        zoom_level: action.zoom_level,
        scale_factor: action.zoom_level.scale_factor(),
        saved_path,
        processing_time_ms,
    })
}

/// Performs a zoom operation and returns the raw image data.
///
/// This is a lower-level function that returns the scaled image
/// directly without base64 encoding.
pub fn zoom_region_raw(action: &ZoomAction) -> Result<RgbaImage> {
    action.validate()?;

    let captured = capture_region(
        action.region.x,
        action.region.y,
        action.region.width,
        action.region.height,
    )
    .context("Failed to capture screen region")?;

    let (out_width, out_height) = action.output_dimensions();
    let dynamic_image = DynamicImage::ImageRgba8(captured.pixels);
    let scaled =
        dynamic_image.resize_exact(out_width, out_height, action.interpolation.to_filter_type());

    Ok(scaled.to_rgba8())
}

/// Creates a ZoomAction centered on a coordinate with auto-sizing.
///
/// This is useful when you want to zoom in on a specific point
/// without knowing the exact region bounds.
///
/// # Arguments
///
/// * `x` - X coordinate to center on
/// * `y` - Y coordinate to center on
/// * `context_size` - Size of the region around the point (before zoom)
/// * `zoom_level` - Zoom level to apply
pub fn zoom_around_point(x: i32, y: i32, context_size: u32, zoom_level: ZoomLevel) -> ZoomAction {
    let half = (context_size / 2) as i32;
    ZoomAction::new(
        Region::new(x - half, y - half, context_size, context_size),
        zoom_level,
    )
}

/// Suggests an appropriate zoom level based on element size.
///
/// Smaller elements need higher zoom levels for accurate inspection.
pub fn suggest_zoom_level(width: u32, height: u32) -> ZoomLevel {
    let min_dimension = width.min(height);

    match min_dimension {
        0..=10 => ZoomLevel::X8,
        11..=25 => ZoomLevel::X4,
        26..=50 => ZoomLevel::X2,
        _ => ZoomLevel::X2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zoom_level_scale_factor() {
        assert!((ZoomLevel::X2.scale_factor() - 2.0).abs() < 0.001);
        assert!((ZoomLevel::X4.scale_factor() - 4.0).abs() < 0.001);
        assert!((ZoomLevel::X8.scale_factor() - 8.0).abs() < 0.001);
        assert!((ZoomLevel::Custom(3.5).scale_factor() - 3.5).abs() < 0.001);
    }

    #[test]
    fn test_zoom_level_clamping() {
        // Values above 16 should be clamped
        assert!((ZoomLevel::Custom(20.0).scale_factor() - 16.0).abs() < 0.001);
        // Values below 1 should be clamped
        assert!((ZoomLevel::Custom(0.5).scale_factor() - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_zoom_level_from_factor() {
        assert_eq!(ZoomLevel::from_factor(2.0), ZoomLevel::X2);
        assert_eq!(ZoomLevel::from_factor(4.0), ZoomLevel::X4);
        assert_eq!(ZoomLevel::from_factor(8.0), ZoomLevel::X8);
        // Custom factor
        match ZoomLevel::from_factor(3.0) {
            ZoomLevel::Custom(f) => assert!((f - 3.0).abs() < 0.001),
            _ => panic!("Expected Custom zoom level"),
        }
    }

    #[test]
    fn test_region_basic() {
        let region = Region::new(100, 200, 50, 30);
        assert_eq!(region.x, 100);
        assert_eq!(region.y, 200);
        assert_eq!(region.width, 50);
        assert_eq!(region.height, 30);
        assert!(region.is_valid());
    }

    #[test]
    fn test_region_center() {
        let region = Region::new(100, 200, 50, 30);
        let (cx, cy) = region.center();
        assert_eq!(cx, 125);
        assert_eq!(cy, 215);
    }

    #[test]
    fn test_region_expand() {
        let region = Region::new(100, 200, 50, 30);
        let expanded = region.expand(10);
        assert_eq!(expanded.x, 90);
        assert_eq!(expanded.y, 190);
        assert_eq!(expanded.width, 70);
        assert_eq!(expanded.height, 50);
    }

    #[test]
    fn test_region_area() {
        let region = Region::new(0, 0, 100, 50);
        assert_eq!(region.area(), 5000);
    }

    #[test]
    fn test_region_invalid() {
        let invalid = Region::new(0, 0, 0, 100);
        assert!(!invalid.is_valid());

        let invalid2 = Region::new(0, 0, 100, 0);
        assert!(!invalid2.is_valid());
    }

    #[test]
    fn test_region_element_bounds_conversion() {
        let bounds = ElementBounds::new(100, 200, 50, 30);
        let region = Region::from_element_bounds(&bounds);
        assert_eq!(region.x, bounds.left);
        assert_eq!(region.y, bounds.top);
        assert_eq!(region.width, bounds.width);
        assert_eq!(region.height, bounds.height);

        let converted_bounds = region.to_element_bounds();
        assert_eq!(converted_bounds.left, bounds.left);
        assert_eq!(converted_bounds.top, bounds.top);
    }

    #[test]
    fn test_zoom_action_output_dimensions() {
        let action = ZoomAction::new(Region::new(0, 0, 100, 50), ZoomLevel::X2);
        let (width, height) = action.output_dimensions();
        assert_eq!(width, 200);
        assert_eq!(height, 100);

        let action4x = ZoomAction::new(Region::new(0, 0, 100, 50), ZoomLevel::X4);
        let (width4x, height4x) = action4x.output_dimensions();
        assert_eq!(width4x, 400);
        assert_eq!(height4x, 200);
    }

    #[test]
    fn test_zoom_action_validation() {
        // Valid action
        let valid = ZoomAction::new(Region::new(0, 0, 100, 50), ZoomLevel::X2);
        assert!(valid.validate().is_ok());

        // Invalid region
        let invalid_region = ZoomAction::new(Region::new(0, 0, 0, 50), ZoomLevel::X2);
        assert!(invalid_region.validate().is_err());

        // Too large output (region too big for high zoom)
        let too_large = ZoomAction::new(Region::new(0, 0, 2000, 2000), ZoomLevel::X8);
        assert!(too_large.validate().is_err());
    }

    #[test]
    fn test_zoom_around_point() {
        let action = zoom_around_point(500, 300, 100, ZoomLevel::X4);
        assert_eq!(action.region.x, 450);
        assert_eq!(action.region.y, 250);
        assert_eq!(action.region.width, 100);
        assert_eq!(action.region.height, 100);
        assert_eq!(action.zoom_level, ZoomLevel::X4);
    }

    #[test]
    fn test_suggest_zoom_level() {
        assert_eq!(suggest_zoom_level(5, 5), ZoomLevel::X8);
        assert_eq!(suggest_zoom_level(20, 15), ZoomLevel::X4);
        assert_eq!(suggest_zoom_level(40, 30), ZoomLevel::X2);
        assert_eq!(suggest_zoom_level(100, 100), ZoomLevel::X2);
    }

    #[test]
    fn test_interpolation_method() {
        // Verify defaults
        assert_eq!(
            InterpolationMethod::default(),
            InterpolationMethod::Bilinear
        );

        // Verify filter type conversion works (just check it doesn't panic)
        let _ = InterpolationMethod::Nearest.to_filter_type();
        let _ = InterpolationMethod::Bilinear.to_filter_type();
        let _ = InterpolationMethod::Lanczos3.to_filter_type();
        let _ = InterpolationMethod::CatmullRom.to_filter_type();
    }

    #[test]
    fn test_zoom_action_builder_pattern() {
        let action = ZoomAction::new(Region::new(0, 0, 100, 50), ZoomLevel::X2)
            .with_save_path("/tmp/test.png")
            .with_interpolation(InterpolationMethod::Lanczos3);

        assert_eq!(action.save_path, Some("/tmp/test.png".to_string()));
        assert_eq!(action.interpolation, InterpolationMethod::Lanczos3);
    }

    #[test]
    fn test_zoom_action_serialization() {
        let action = ZoomAction::new(Region::new(100, 200, 50, 30), ZoomLevel::X4);

        let json = serde_json::to_string(&action).unwrap();
        let parsed: ZoomAction = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.region.x, 100);
        assert_eq!(parsed.region.y, 200);
        assert_eq!(parsed.zoom_level, ZoomLevel::X4);
    }

    #[test]
    fn test_zoom_result_serialization() {
        let result = ZoomResult {
            image_base64: "dGVzdA==".to_string(),
            width: 200,
            height: 100,
            original_region: Region::new(0, 0, 100, 50),
            zoom_level: ZoomLevel::X2,
            scale_factor: 2.0,
            saved_path: None,
            processing_time_ms: 15,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: ZoomResult = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.width, 200);
        assert_eq!(parsed.height, 100);
        assert_eq!(parsed.scale_factor, 2.0);
    }
}
