use super::*;
use crate::automation::screen::{capture_primary_screen, capture_region};
use anyhow::{anyhow, Result};
use image::ImageBuffer;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;

pub struct VisionAutomation {
    screenshot_dir: PathBuf,
}

impl VisionAutomation {
    pub fn new() -> Result<Self> {
        let screenshot_dir = std::env::temp_dir().join("agiworkforce_screenshots");
        std::fs::create_dir_all(&screenshot_dir)?;

        Ok(Self { screenshot_dir })
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

    pub async fn find_text(&self, query: &str, fuzzy: bool) -> Result<Vec<(i32, i32, String)>> {
        #[cfg(feature = "ocr")]
        {
            let screenshot_path = match self.capture_screenshot(None).await {
                Ok(path) => path,
                Err(_) => return Ok(Vec::new()),
            };
            use crate::automation::screen::perform_ocr;
            let ocr_result = match perform_ocr(&screenshot_path).await {
                Ok(result) => result,
                Err(_) => return Ok(Vec::new()),
            };

            let mut matches = Vec::new();
            if fuzzy {
                if ocr_result
                    .text
                    .to_lowercase()
                    .contains(&query.to_lowercase())
                {
                    matches.push((960, 540, ocr_result.text.clone()));
                }
            } else if ocr_result.text.contains(query) {
                matches.push((960, 540, ocr_result.text.clone()));
            }
            Ok(matches)
        }

        #[cfg(not(feature = "ocr"))]
        {
            let _ = query;
            let _ = fuzzy;
            Ok(Vec::new())
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

    pub async fn wait_for_element(&self, target: &ClickTarget, timeout: Duration) -> Result<()> {
        let start = std::time::Instant::now();
        let check_interval = Duration::from_millis(500);

        loop {
            if start.elapsed() >= timeout {
                return Err(anyhow!("Element not found within timeout"));
            }

            match target {
                ClickTarget::TextMatch { text, fuzzy } => {
                    if let Ok(matches) = self.find_text(text, *fuzzy).await {
                        if !matches.is_empty() {
                            return Ok(());
                        }
                    }
                }
                ClickTarget::ImageMatch {
                    image_path,
                    threshold,
                } => {
                    if self.find_image(image_path, *threshold).await.is_ok() {
                        return Ok(());
                    }
                }
                _ => {}
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
