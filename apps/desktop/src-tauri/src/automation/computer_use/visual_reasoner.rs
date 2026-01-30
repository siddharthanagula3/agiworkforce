//! Visual Reasoner - Screenshot analysis and UI element detection.
//!
//! This module provides the core visual intelligence for Computer Use,
//! analyzing screenshots to identify UI elements, extract text, and
//! understand the current screen state.

use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::automation::screen::{capture_primary_screen, capture_region, CapturedImage};
use crate::core::llm::llm_router::LLMRouter;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest, Provider,
};

use super::types::{ElementBounds, ScreenAnalysis, ScreenElement};

/// Configuration for the visual reasoner.
#[derive(Debug, Clone)]
pub struct VisualReasonerConfig {
    /// Maximum time to wait for vision LLM response.
    pub vision_timeout: Duration,
    /// Maximum image dimension before downscaling.
    pub max_image_dimension: u32,
    /// JPEG quality for image compression (0-100).
    pub image_quality: u8,
    /// Whether to use OCR for text extraction.
    pub use_ocr: bool,
    /// Minimum confidence threshold for element detection.
    pub element_confidence_threshold: f32,
    /// Whether to cache analysis results.
    pub enable_caching: bool,
    /// Cache duration for screen analysis.
    pub cache_duration: Duration,
}

impl Default for VisualReasonerConfig {
    fn default() -> Self {
        Self {
            vision_timeout: Duration::from_secs(30),
            max_image_dimension: 1920,
            image_quality: 85,
            use_ocr: true,
            element_confidence_threshold: 0.7,
            enable_caching: true,
            cache_duration: Duration::from_secs(2),
        }
    }
}

/// Detection result from analyzing an image region.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementDetection {
    /// Detected elements with their properties.
    pub elements: Vec<ScreenElement>,
    /// Overall confidence of the detection.
    pub confidence: f32,
    /// Time taken for detection.
    pub detection_time_ms: u64,
}

/// Observation of the current screen state.
#[derive(Debug, Clone)]
pub struct ScreenObservation {
    /// The captured screenshot.
    pub screenshot: CapturedImage,
    /// Full screen analysis.
    pub analysis: ScreenAnalysis,
    /// Base64-encoded image for LLM consumption.
    pub image_base64: String,
    /// When this observation was made.
    pub timestamp: Instant,
}

/// The Visual Reasoner analyzes screenshots to understand screen content.
pub struct VisualReasoner {
    llm_router: Arc<Mutex<LLMRouter>>,
    config: VisualReasonerConfig,
    /// Cached last observation for quick reference.
    last_observation: Mutex<Option<ScreenObservation>>,
}

impl VisualReasoner {
    /// Creates a new visual reasoner with the given LLM router and configuration.
    pub fn new(llm_router: Arc<Mutex<LLMRouter>>, config: VisualReasonerConfig) -> Self {
        Self {
            llm_router,
            config,
            last_observation: Mutex::new(None),
        }
    }

    /// Creates a visual reasoner with default configuration.
    pub fn with_defaults(llm_router: Arc<Mutex<LLMRouter>>) -> Self {
        Self::new(llm_router, VisualReasonerConfig::default())
    }

    /// Captures and analyzes the current screen state.
    pub async fn observe_screen(&self) -> Result<ScreenObservation> {
        // Check cache first
        if self.config.enable_caching {
            let cached = self.last_observation.lock().await;
            if let Some(ref obs) = *cached {
                if obs.timestamp.elapsed() < self.config.cache_duration {
                    return Ok(obs.clone());
                }
            }
        }

        // Capture new screenshot
        let screenshot = capture_primary_screen().context("Failed to capture screen")?;

        // Convert to optimized base64 for LLM
        let image_base64 = self.prepare_image_for_llm(&screenshot.pixels)?;

        // Analyze the screen
        let analysis = self.analyze_screenshot(&screenshot, &image_base64).await?;

        let observation = ScreenObservation {
            screenshot,
            analysis,
            image_base64,
            timestamp: Instant::now(),
        };

        // Update cache
        if self.config.enable_caching {
            let mut cached = self.last_observation.lock().await;
            *cached = Some(observation.clone());
        }

        Ok(observation)
    }

    /// Captures and analyzes a specific region of the screen.
    pub async fn observe_region(&self, bounds: ElementBounds) -> Result<ScreenObservation> {
        let region = capture_region(bounds.left, bounds.top, bounds.width, bounds.height)
            .context("Failed to capture region")?;

        // Create a CapturedImage from the region
        let screenshot = CapturedImage {
            pixels: region.pixels,
            screen_index: region.screen_index,
            display: region.display,
        };

        let image_base64 = self.prepare_image_for_llm(&screenshot.pixels)?;
        let analysis = self.analyze_screenshot(&screenshot, &image_base64).await?;

        Ok(ScreenObservation {
            screenshot,
            analysis,
            image_base64,
            timestamp: Instant::now(),
        })
    }

    /// Analyzes a screenshot to extract UI elements and understand the screen state.
    async fn analyze_screenshot(
        &self,
        screenshot: &CapturedImage,
        image_base64: &str,
    ) -> Result<ScreenAnalysis> {
        let analysis_prompt = r#"Analyze this screenshot and identify all interactive UI elements.

For each element, provide:
1. Element type (button, text_field, link, checkbox, dropdown, icon, menu_item, tab, etc.)
2. Label or text content if visible
3. Approximate bounding box as percentages of screen (left%, top%, width%, height%)
4. Whether it appears interactive
5. Whether it appears focused/selected

Also identify:
- The active application/window
- Any modal dialogs blocking interaction
- Loading indicators
- Error messages

Respond with JSON in this exact format:
{
  "elements": [
    {
      "id": "elem_1",
      "element_type": "button",
      "label": "Submit",
      "bounds_percent": {"left": 45, "top": 80, "width": 10, "height": 5},
      "is_interactive": true,
      "is_focused": false,
      "confidence": 0.95
    }
  ],
  "active_window": "Application Name - Window Title",
  "has_modal": false,
  "is_loading": false,
  "error_messages": [],
  "screen_description": "Brief description of what's on screen"
}

Be precise with element detection - only include elements you can clearly identify.
Focus on interactive elements that can be clicked, typed into, or otherwise interacted with."#;

        let response = self
            .call_vision_llm(analysis_prompt, image_base64)
            .await
            .context("Vision LLM analysis failed")?;

        // Parse the response
        let parsed = self.parse_analysis_response(&response, screenshot)?;

        Ok(parsed)
    }

    /// Finds elements matching a description on the current screen.
    pub async fn find_element(&self, description: &str) -> Result<Option<ScreenElement>> {
        let observation = self.observe_screen().await?;

        let find_prompt = format!(
            r#"Look at this screenshot and find the UI element that best matches this description:
"{}"

If you find a matching element, respond with JSON:
{{
  "found": true,
  "element": {{
    "id": "target",
    "element_type": "button|text_field|link|etc",
    "label": "visible label or text",
    "bounds_percent": {{"left": 45, "top": 80, "width": 10, "height": 5}},
    "is_interactive": true,
    "is_focused": false,
    "confidence": 0.9
  }},
  "reasoning": "Why this element matches"
}}

If no matching element is found, respond with:
{{
  "found": false,
  "reasoning": "Why no element matches"
}}"#,
            description
        );

        let response = self
            .call_vision_llm(&find_prompt, &observation.image_base64)
            .await?;

        // Parse find result
        let json_str = self.extract_json(&response)?;
        let parsed: serde_json::Value =
            serde_json::from_str(&json_str).context("Failed to parse find response")?;

        if parsed
            .get("found")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            if let Some(elem) = parsed.get("element") {
                let element = self.parse_element_json(
                    elem,
                    observation.screenshot.pixels.width(),
                    observation.screenshot.pixels.height(),
                )?;
                return Ok(Some(element));
            }
        }

        Ok(None)
    }

    /// Locates text on the screen and returns its position.
    pub async fn find_text(&self, text: &str) -> Result<Option<ElementBounds>> {
        let observation = self.observe_screen().await?;

        let find_prompt = format!(
            r#"Find the exact location of this text on the screen: "{}"

If found, respond with JSON:
{{
  "found": true,
  "bounds_percent": {{"left": 45, "top": 80, "width": 10, "height": 3}},
  "confidence": 0.95
}}

If not found:
{{
  "found": false
}}"#,
            text
        );

        let response = self
            .call_vision_llm(&find_prompt, &observation.image_base64)
            .await?;

        let json_str = self.extract_json(&response)?;
        let parsed: serde_json::Value = serde_json::from_str(&json_str)?;

        if parsed
            .get("found")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            if let Some(bounds) = parsed.get("bounds_percent") {
                let elem_bounds = self.percent_to_pixels(
                    bounds,
                    observation.screenshot.pixels.width(),
                    observation.screenshot.pixels.height(),
                )?;
                return Ok(Some(elem_bounds));
            }
        }

        Ok(None)
    }

    /// Compares two screenshots and determines if there are significant changes.
    pub fn detect_changes(&self, before: &RgbaImage, after: &RgbaImage) -> ChangeDetection {
        if before.dimensions() != after.dimensions() {
            return ChangeDetection {
                has_changes: true,
                change_percent: 100.0,
                changed_regions: vec![],
            };
        }

        let (width, height) = before.dimensions();
        let total_pixels = (width * height) as f32;
        let mut changed_pixels = 0u32;

        // Sample pixels for efficiency (check every 4th pixel)
        for y in (0..height).step_by(4) {
            for x in (0..width).step_by(4) {
                let p1 = before.get_pixel(x, y);
                let p2 = after.get_pixel(x, y);

                // Check if pixel differs significantly
                let diff =
                    p1.0.iter()
                        .zip(p2.0.iter())
                        .map(|(a, b)| (*a as i16 - *b as i16).unsigned_abs() as u32)
                        .sum::<u32>();

                if diff > 30 {
                    // Threshold for considering a pixel changed
                    changed_pixels += 16; // Account for sampling
                }
            }
        }

        let change_percent = (changed_pixels as f32 / total_pixels) * 100.0;

        ChangeDetection {
            has_changes: change_percent > 0.5, // >0.5% change is significant
            change_percent,
            changed_regions: vec![], // Could be enhanced to identify specific regions
        }
    }

    /// Waits for screen content to stabilize (no significant changes).
    pub async fn wait_for_stable(&self, timeout_duration: Duration) -> Result<bool> {
        let start = Instant::now();
        let check_interval = Duration::from_millis(200);

        let mut last_screenshot = capture_primary_screen()?.pixels;

        while start.elapsed() < timeout_duration {
            tokio::time::sleep(check_interval).await;

            let current = capture_primary_screen()?.pixels;
            let changes = self.detect_changes(&last_screenshot, &current);

            if !changes.has_changes {
                return Ok(true);
            }

            last_screenshot = current;
        }

        Ok(false)
    }

    /// Prepares an image for LLM consumption with appropriate sizing and encoding.
    fn prepare_image_for_llm(&self, image: &RgbaImage) -> Result<String> {
        let (width, height) = image.dimensions();

        // Downscale if necessary
        let dynamic_image = if width > self.config.max_image_dimension
            || height > self.config.max_image_dimension
        {
            let scale = self.config.max_image_dimension as f32 / width.max(height) as f32;
            let new_width = (width as f32 * scale) as u32;
            let new_height = (height as f32 * scale) as u32;

            DynamicImage::ImageRgba8(image.clone()).resize(
                new_width,
                new_height,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            DynamicImage::ImageRgba8(image.clone())
        };

        // Encode as PNG for best quality
        let mut buf = Vec::new();
        dynamic_image
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .context("Failed to encode image")?;

        Ok(general_purpose::STANDARD.encode(&buf))
    }

    /// Calls the vision LLM with an image and prompt.
    async fn call_vision_llm(&self, prompt: &str, image_base64: &str) -> Result<String> {
        let router = self.llm_router.lock().await;

        let image_bytes = general_purpose::STANDARD
            .decode(image_base64)
            .context("Failed to decode base64 image")?;

        let multimodal_content = vec![
            ContentPart::Text {
                text: prompt.to_string(),
            },
            ContentPart::Image {
                image: ImageInput {
                    data: image_bytes,
                    format: ImageFormat::Png,
                    detail: ImageDetail::High,
                },
            },
        ];

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(multimodal_content),
            }],
            model: String::new(),
            temperature: Some(0.1), // Low temperature for consistent analysis
            max_tokens: Some(4096),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
        };

        let preferences = crate::core::llm::llm_router::RouterPreferences {
            provider: Some(Provider::Anthropic),
            model: Some("claude-sonnet-4-5".to_string()),
            strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
            context: Some(crate::core::llm::llm_router::RouterContext {
                requires_vision: true,
                ..Default::default()
            }),
            prefer_cloud_credits: false,
        };

        let candidates = router.candidates(&request, &preferences);
        if candidates.is_empty() {
            return Err(anyhow::anyhow!(
                "No vision-capable LLM providers configured"
            ));
        }

        let llm_future = router.invoke_candidate(&candidates[0], &request);
        let outcome = timeout(self.config.vision_timeout, llm_future)
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "Vision LLM request timed out after {:?}",
                    self.config.vision_timeout
                )
            })?
            .context("Vision LLM request failed")?;

        Ok(outcome.response.content)
    }

    /// Extracts JSON from a potentially markdown-wrapped response.
    fn extract_json<'a>(&self, response: &'a str) -> Result<&'a str> {
        // Try to find JSON between ```json and ```
        if let Some(start) = response.find("```json") {
            let json_start = start + 7;
            if let Some(end) = response[json_start..].find("```") {
                return Ok(response[json_start..json_start + end].trim());
            }
        }

        // Try to find raw JSON
        if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                if end >= start {
                    return Ok(&response[start..=end]);
                }
            }
        }

        Err(anyhow::anyhow!("No JSON found in response"))
    }

    /// Parses the full analysis response into a ScreenAnalysis struct.
    fn parse_analysis_response(
        &self,
        response: &str,
        screenshot: &CapturedImage,
    ) -> Result<ScreenAnalysis> {
        let json_str = self.extract_json(response)?;

        // Size limit check
        if json_str.len() > 1024 * 1024 {
            return Err(anyhow::anyhow!("Response too large"));
        }

        let parsed: serde_json::Value =
            serde_json::from_str(json_str).context("Failed to parse analysis JSON")?;

        let (width, height) = (screenshot.pixels.width(), screenshot.pixels.height());

        // Parse elements
        let elements = if let Some(elems) = parsed.get("elements").and_then(|e| e.as_array()) {
            elems
                .iter()
                .filter_map(|e| self.parse_element_json(e, width, height).ok())
                .filter(|e| e.confidence >= self.config.element_confidence_threshold)
                .collect()
        } else {
            Vec::new()
        };

        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Ok(ScreenAnalysis {
            elements,
            text_regions: Vec::new(), // OCR would populate this
            screen_description: parsed
                .get("screen_description")
                .and_then(|v| v.as_str())
                .unwrap_or("Screen analysis complete")
                .to_string(),
            active_window: parsed
                .get("active_window")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            has_modal: parsed
                .get("has_modal")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            is_loading: parsed
                .get("is_loading")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            error_messages: parsed
                .get("error_messages")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            timestamp_ms,
        })
    }

    /// Parses a single element from JSON.
    fn parse_element_json(
        &self,
        elem: &serde_json::Value,
        screen_width: u32,
        screen_height: u32,
    ) -> Result<ScreenElement> {
        let id = elem
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let element_type = elem
            .get("element_type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let label = elem.get("label").and_then(|v| v.as_str()).map(String::from);

        let bounds = if let Some(bp) = elem.get("bounds_percent") {
            self.percent_to_pixels(bp, screen_width, screen_height)?
        } else {
            ElementBounds::new(0, 0, 0, 0)
        };

        let confidence = elem
            .get("confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;

        let is_interactive = elem
            .get("is_interactive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let is_focused = elem
            .get("is_focused")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        Ok(ScreenElement {
            id,
            element_type,
            label,
            bounds,
            confidence,
            is_interactive,
            is_focused,
            properties: std::collections::HashMap::new(),
        })
    }

    /// Converts percentage-based bounds to pixel coordinates.
    fn percent_to_pixels(
        &self,
        bounds: &serde_json::Value,
        screen_width: u32,
        screen_height: u32,
    ) -> Result<ElementBounds> {
        let left_pct = bounds.get("left").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let top_pct = bounds.get("top").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let width_pct = bounds.get("width").and_then(|v| v.as_f64()).unwrap_or(10.0);
        let height_pct = bounds.get("height").and_then(|v| v.as_f64()).unwrap_or(5.0);

        Ok(ElementBounds {
            left: ((left_pct / 100.0) * screen_width as f64) as i32,
            top: ((top_pct / 100.0) * screen_height as f64) as i32,
            width: ((width_pct / 100.0) * screen_width as f64) as u32,
            height: ((height_pct / 100.0) * screen_height as f64) as u32,
        })
    }
}

/// Result of comparing two screenshots for changes.
#[derive(Debug, Clone)]
pub struct ChangeDetection {
    /// Whether significant changes were detected.
    pub has_changes: bool,
    /// Percentage of screen that changed.
    pub change_percent: f32,
    /// Specific regions that changed (if detected).
    pub changed_regions: Vec<ElementBounds>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = VisualReasonerConfig::default();
        assert_eq!(config.vision_timeout, Duration::from_secs(30));
        assert_eq!(config.max_image_dimension, 1920);
        assert!(config.use_ocr);
    }

    #[test]
    fn test_percent_to_pixels() {
        let llm_router = Arc::new(Mutex::new(LLMRouter::new()));
        let reasoner = VisualReasoner::with_defaults(llm_router);

        let bounds_json = serde_json::json!({
            "left": 10,
            "top": 20,
            "width": 30,
            "height": 10
        });

        let bounds = reasoner
            .percent_to_pixels(&bounds_json, 1920, 1080)
            .unwrap();

        assert_eq!(bounds.left, 192); // 10% of 1920
        assert_eq!(bounds.top, 216); // 20% of 1080
        assert_eq!(bounds.width, 576); // 30% of 1920
        assert_eq!(bounds.height, 108); // 10% of 1080
    }

    #[test]
    fn test_extract_json() {
        let llm_router = Arc::new(Mutex::new(LLMRouter::new()));
        let reasoner = VisualReasoner::with_defaults(llm_router);

        // Test markdown-wrapped JSON
        let response = "Here's the analysis:\n```json\n{\"found\": true}\n```\nDone!";
        let json = reasoner.extract_json(response).unwrap();
        assert!(json.contains("found"));

        // Test raw JSON
        let response2 = "The result is: {\"found\": false}";
        let json2 = reasoner.extract_json(response2).unwrap();
        assert!(json2.contains("found"));
    }
}
