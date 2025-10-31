use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

pub fn perform_ocr(path: &str) -> Result<OcrResult> {
    let mut instance = tesseract::Tesseract::new(None, "eng")
        .context("Failed to initialise Tesseract (lang: eng)")?;
    instance
        .set_image(path)
        .context("Failed to load image for OCR")?;
    let text = instance.get_text().context("Failed to extract OCR text")?;
    let confidence = instance.mean_text_confidence().unwrap_or(0) as f32 / 100.0;
    Ok(OcrResult { text, confidence })
}
