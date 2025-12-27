use anyhow::{Context, Result};

#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

pub async fn perform_ocr(path: &str) -> Result<OcrResult> {
    let path = path.to_string();

    tokio::task::spawn_blocking(move || {
        let instance = tesseract::Tesseract::new(None, Some("eng"))
            .context("Failed to initialise Tesseract (lang: eng)")?;
        let mut instance = instance
            .set_image(&path)
            .context("Failed to load image for OCR")?;
        let text = instance.get_text().context("Failed to extract OCR text")?;
        let confidence = instance.mean_text_conf() as f32 / 100.0;
        Ok(OcrResult { text, confidence })
    })
    .await
    .context("OCR task panicked")?
}
