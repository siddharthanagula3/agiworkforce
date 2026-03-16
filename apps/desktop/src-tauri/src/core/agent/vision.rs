use super::*;
use crate::automation::screen::{capture_primary_screen, capture_region};
use anyhow::{anyhow, Result};
use image::ImageBuffer;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;

/// Maximum timeout for `wait_for_element` to prevent indefinite hangs.
/// Even if the caller requests a longer timeout, this cap is enforced.
const MAX_WAIT_TIMEOUT: Duration = Duration::from_secs(120);

/// Number of consecutive screen capture failures before `wait_for_element`
/// gives up. Prevents futile polling when the display is disconnected or
/// permissions are missing.
const MAX_CAPTURE_FAILURES: u32 = 5;

/// Minimum OCR confidence (0.0..1.0) below which matches are discarded.
/// Tesseract confidence at or below 15% is essentially random noise and
/// would cause false-positive text matches / clicks.
#[cfg(feature = "ocr")]
const MIN_OCR_CONFIDENCE: f32 = 0.15;

pub struct VisionAutomation {
    screenshot_dir: PathBuf,
}

impl VisionAutomation {
    pub fn new() -> Result<Self> {
        let screenshot_dir = std::env::temp_dir().join("agiworkforce_screenshots");
        std::fs::create_dir_all(&screenshot_dir)?;

        Ok(Self { screenshot_dir })
    }

    /// Returns `true` when OCR text recognition is available in this build.
    ///
    /// On builds compiled without the `ocr` feature flag, this returns `false`
    /// and callers should avoid attempting text-based vision operations.
    #[inline]
    pub fn is_ocr_available() -> bool {
        cfg!(feature = "ocr")
    }

    /// Returns `true` when the given `ClickTarget` requires OCR capability.
    ///
    /// `TextMatch` targets need OCR to find text on screen.
    /// `ImageMatch` targets need screen capture but not OCR.
    /// `Coordinates` and `UIAElement` targets need no vision at all.
    pub fn target_requires_ocr(target: &ClickTarget) -> bool {
        matches!(target, ClickTarget::TextMatch { .. })
    }

    /// Returns `true` when the given `ClickTarget` requires screen capture.
    ///
    /// Both `TextMatch` and `ImageMatch` need screen capture; `Coordinates`
    /// and `UIAElement` do not.
    pub fn target_requires_screen_capture(target: &ClickTarget) -> bool {
        matches!(
            target,
            ClickTarget::TextMatch { .. } | ClickTarget::ImageMatch { .. }
        )
    }

    /// Pre-flight check: validates that the required vision capabilities are
    /// available for the given action. Returns `Ok(())` if the action can
    /// proceed, or an error describing the missing capability.
    pub fn check_vision_capability(action: &Action) -> Result<()> {
        match action {
            Action::WaitForElement { target, .. } | Action::Click { target } => {
                if Self::target_requires_ocr(target) && !Self::is_ocr_available() {
                    return Err(anyhow!(
                        "OCR feature not enabled — cannot perform text-based vision operation. \
                         Build with the 'ocr' feature flag or use coordinate/UIAElement targets."
                    ));
                }
                Ok(())
            }
            Action::Type { target, .. } => {
                if Self::target_requires_ocr(target) && !Self::is_ocr_available() {
                    return Err(anyhow!(
                        "OCR feature not enabled — cannot locate text target for typing. \
                         Build with the 'ocr' feature flag or use coordinate/UIAElement targets."
                    ));
                }
                Ok(())
            }
            Action::SearchText { .. } => {
                if !Self::is_ocr_available() {
                    return Err(anyhow!(
                        "OCR feature not enabled — cannot search for text on screen. \
                         Build with the 'ocr' feature flag."
                    ));
                }
                Ok(())
            }
            // Screenshot, Navigate, ExecuteCommand, ReadFile, WriteFile, Scroll, PressKey
            // do not require vision/OCR capabilities.
            _ => Ok(()),
        }
    }

    pub async fn capture_screenshot(&self, region: Option<ScreenRegion>) -> Result<String> {
        let filename = format!("screenshot_{}.png", &uuid::Uuid::new_v4().to_string()[..8]);
        let path = self.screenshot_dir.join(&filename);

        if let Some(region) = region {
            let captured = capture_region(
                region.x,
                region.y,
                region.width as u32,
                region.height as u32,
            )?;
            captured.pixels.save(&path)?;
        } else {
            let captured = capture_primary_screen()?;
            captured.pixels.save(&path)?;
        }

        Ok(path.to_string_lossy().to_string())
    }

    /// Search the primary screen for `query` text using OCR.
    ///
    /// Returns a list of `(x, y, matched_text)` tuples.  Because the current
    /// Tesseract backend does not provide per-word bounding boxes, the returned
    /// coordinates are the *center of the captured screen* -- this is the best
    /// approximation available until a bbox-capable OCR backend is integrated.
    ///
    /// # Screen dimension detection
    ///
    /// The screen is captured exactly **once** and reused for both dimension
    /// detection and the OCR pass to avoid redundant screen captures.  The
    /// center coordinates are derived from the actual captured pixel buffer
    /// dimensions, which correctly handles Retina/HiDPI screens where the
    /// pixel buffer may be 2x the logical resolution (e.g. 3840x2160 on a
    /// 1920x1080 logical display).
    ///
    /// # Guards
    ///
    /// - Returns `Err` on non-OCR builds so callers get an immediate diagnostic.
    /// - Returns empty `Vec` if screen capture fails (logs warning).
    /// - Returns empty `Vec` if captured image has zero dimensions.
    /// - Returns empty `Vec` if OCR confidence is below `MIN_OCR_CONFIDENCE`.
    pub async fn find_text(&self, query: &str, fuzzy: bool) -> Result<Vec<(i32, i32, String)>> {
        #[cfg(feature = "ocr")]
        {
            // Capture the screen exactly once -- reuse the same image for both
            // dimension detection and saving to disk for the OCR engine.  This
            // eliminates the previous bug where two separate captures could
            // return different screen contents or dimensions.
            let captured = match capture_primary_screen() {
                Ok(img) => img,
                Err(e) => {
                    tracing::warn!("Screen capture failed during find_text: {}", e);
                    return Ok(Vec::new());
                }
            };

            let img_width = captured.pixels.width();
            let img_height = captured.pixels.height();

            // Guard: reject zero-dimension captures (headless / broken display).
            if img_width == 0 || img_height == 0 {
                tracing::warn!(
                    "Captured screen has zero dimensions ({}x{}) — cannot locate text",
                    img_width,
                    img_height
                );
                return Ok(Vec::new());
            }

            // Derive center coordinates from the actual captured image dimensions.
            let center_x = (img_width / 2) as i32;
            let center_y = (img_height / 2) as i32;

            // Save the already-captured image to disk for the OCR engine, avoiding
            // a second call to capture_primary_screen().
            let filename =
                format!("screenshot_{}.png", &uuid::Uuid::new_v4().to_string()[..8]);
            let screenshot_path = self.screenshot_dir.join(&filename);
            if let Err(e) = captured.pixels.save(&screenshot_path) {
                tracing::warn!("Failed to save screenshot for OCR: {}", e);
                return Ok(Vec::new());
            }

            let screenshot_path_str = screenshot_path.to_string_lossy().to_string();

            use crate::automation::screen::perform_ocr;
            let ocr_result = match perform_ocr(&screenshot_path_str).await {
                Ok(result) => result,
                Err(e) => {
                    tracing::warn!("OCR engine failed: {}", e);
                    return Ok(Vec::new());
                }
            };

            // Guard: discard results with very low confidence -- they are
            // almost certainly garbage and would cause false-positive clicks.
            if ocr_result.confidence < MIN_OCR_CONFIDENCE {
                tracing::info!(
                    "OCR confidence too low ({:.1}% < {:.1}%) — discarding result",
                    ocr_result.confidence * 100.0,
                    MIN_OCR_CONFIDENCE * 100.0
                );
                return Ok(Vec::new());
            }

            let mut matches = Vec::new();
            if fuzzy {
                if ocr_result
                    .text
                    .to_lowercase()
                    .contains(&query.to_lowercase())
                {
                    matches.push((center_x, center_y, ocr_result.text.clone()));
                }
            } else if ocr_result.text.contains(query) {
                matches.push((center_x, center_y, ocr_result.text.clone()));
            }
            Ok(matches)
        }

        #[cfg(not(feature = "ocr"))]
        {
            let _ = query;
            let _ = fuzzy;
            // On non-OCR builds there is no way to search for text on screen.
            // Return an error immediately so callers (e.g. wait_for_element) surface a
            // useful diagnostic instead of silently spinning until their timeout.
            Err(anyhow!(
                "OCR feature not enabled — cannot search for text on screen"
            ))
        }
    }

    pub async fn search_text(&self, query: &str) -> Result<Vec<(i32, i32)>> {
        let matches = self.find_text(query, true).await?;
        Ok(matches.iter().map(|(x, y, _)| (*x, *y)).collect())
    }

    pub async fn find_text_single(&self, query: &str, fuzzy: bool) -> Result<(i32, i32)> {
        let matches = self.find_text(query, fuzzy).await?;
        matches
            .first()
            .map(|(x, y, _)| (*x, *y))
            .ok_or_else(|| anyhow!("Text '{}' not found on screen", query))
    }

    pub async fn find_image(&self, template_path: &str, threshold: f64) -> Result<(i32, i32)> {
        let screenshot_path = self.capture_screenshot(None).await?;

        let template = image::open(template_path)?;
        let screenshot = image::open(&screenshot_path)?;

        let template_gray = template.to_luma8();
        let screenshot_gray = screenshot.to_luma8();

        let best_match = self.template_match(&screenshot_gray, &template_gray, threshold)?;

        Ok(best_match)
    }

    /// Wait for a visual element to appear on screen, polling at 500ms intervals.
    ///
    /// # Guards
    ///
    /// - Rejects `Coordinates` / `UIAElement` targets immediately (they cannot
    ///   be visually polled).
    /// - Rejects `TextMatch` targets on non-OCR builds immediately.
    /// - Caps the timeout at `MAX_WAIT_TIMEOUT` (120s) to prevent indefinite hangs.
    /// - Bails out after `MAX_CAPTURE_FAILURES` consecutive screen capture errors
    ///   to avoid futile polling when the display is unavailable.
    pub async fn wait_for_element(&self, target: &ClickTarget, timeout: Duration) -> Result<()> {
        // Pre-flight: fail immediately if the target requires OCR but it is unavailable.
        if Self::target_requires_ocr(target) && !Self::is_ocr_available() {
            return Err(anyhow!(
                "OCR feature not enabled — cannot wait for text element on screen. \
                 Build with the 'ocr' feature flag or use coordinate/UIAElement targets."
            ));
        }

        // Fail immediately for target types that cannot be waited on (Coordinates
        // and UIAElement have no visual search — they are either immediately
        // available or not).
        if !Self::target_requires_screen_capture(target) {
            return Err(anyhow!(
                "Cannot wait for {} target — only TextMatch and ImageMatch \
                 targets support visual polling. Use Click for coordinate or \
                 UIAElement targets instead.",
                match target {
                    ClickTarget::Coordinates { .. } => "Coordinates",
                    ClickTarget::UIAElement { .. } => "UIAElement",
                    _ => "unknown",
                }
            ));
        }

        // Cap the timeout to prevent indefinite hangs.
        let effective_timeout = timeout.min(MAX_WAIT_TIMEOUT);
        if timeout > MAX_WAIT_TIMEOUT {
            tracing::warn!(
                "[Vision] wait_for_element timeout capped from {:?} to {:?}",
                timeout,
                MAX_WAIT_TIMEOUT
            );
        }

        let start = std::time::Instant::now();
        let check_interval = Duration::from_millis(500);
        let mut consecutive_capture_failures: u32 = 0;

        loop {
            if start.elapsed() >= effective_timeout {
                return Err(anyhow!(
                    "Element not found within timeout ({:?})",
                    effective_timeout
                ));
            }

            match target {
                ClickTarget::TextMatch { text, fuzzy } => {
                    match self.find_text(text, *fuzzy).await {
                        Ok(matches) => {
                            consecutive_capture_failures = 0;
                            if !matches.is_empty() {
                                return Ok(());
                            }
                        }
                        Err(e) => {
                            // Propagate capability errors (e.g. OCR not enabled) immediately
                            // rather than silently looping until timeout.
                            return Err(e);
                        }
                    }
                }
                ClickTarget::ImageMatch {
                    image_path,
                    threshold,
                } => {
                    match self.find_image(image_path, *threshold).await {
                        Ok(_) => return Ok(()),
                        Err(e) => {
                            let err_str = e.to_string();
                            // Distinguish between "not found" (expected during polling)
                            // and persistent infrastructure errors (screen capture failure,
                            // file I/O error). Bail out on the latter to avoid futile looping.
                            if err_str.contains("Template not found")
                                || err_str.contains("best score")
                            {
                                // Normal "not found yet" — keep polling
                                consecutive_capture_failures = 0;
                            } else {
                                consecutive_capture_failures += 1;
                                tracing::warn!(
                                    "[Vision] Image match infrastructure error ({}/{}): {}",
                                    consecutive_capture_failures,
                                    MAX_CAPTURE_FAILURES,
                                    err_str
                                );
                                if consecutive_capture_failures >= MAX_CAPTURE_FAILURES {
                                    return Err(anyhow!(
                                        "Screen capture failed {} consecutive times, aborting wait: {}",
                                        MAX_CAPTURE_FAILURES,
                                        err_str
                                    ));
                                }
                            }
                        }
                    }
                }
                // Coordinates and UIAElement are rejected by the pre-flight check above,
                // so this branch should never be reached. Return an error defensively.
                _ => {
                    return Err(anyhow!(
                        "Unsupported target type for wait_for_element"
                    ));
                }
            }

            sleep(check_interval).await;
        }
    }

    fn template_match(
        &self,
        image: &ImageBuffer<image::Luma<u8>, Vec<u8>>,
        template: &ImageBuffer<image::Luma<u8>, Vec<u8>>,
        threshold: f64,
    ) -> Result<(i32, i32)> {
        let img_width = image.width();
        let img_height = image.height();
        let tmpl_width = template.width();
        let tmpl_height = template.height();

        if tmpl_width > img_width || tmpl_height > img_height {
            return Err(anyhow!("Template larger than image"));
        }

        let mut best_match = (0, 0);
        let mut best_score = 0.0;

        for y in 0..=(img_height - tmpl_height) {
            for x in 0..=(img_width - tmpl_width) {
                let mut score = 0.0;
                let mut count = 0;

                for ty in 0..tmpl_height {
                    for tx in 0..tmpl_width {
                        let img_pixel = image.get_pixel(x + tx, y + ty)[0] as f64;
                        let tmpl_pixel = template.get_pixel(tx, ty)[0] as f64;

                        score += (img_pixel - tmpl_pixel).abs();
                        count += 1;
                    }
                }

                let normalized_score = 1.0 - (score / (count as f64 * 255.0));
                if normalized_score > best_score && normalized_score >= threshold {
                    best_score = normalized_score;
                    best_match = ((x + tmpl_width / 2) as i32, (y + tmpl_height / 2) as i32);
                }
            }
        }

        if best_score < threshold {
            return Err(anyhow!("Template not found (best score: {})", best_score));
        }

        Ok(best_match)
    }
}
