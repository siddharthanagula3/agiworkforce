use anyhow::{Context, Result};

/// A single word recognized by the OCR engine with its bounding box.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrWord {
    pub text: String,
    pub confidence: f32,
    /// Left edge of the bounding box in pixels.
    pub x: i32,
    /// Top edge of the bounding box in pixels.
    pub y: i32,
    /// Width of the bounding box in pixels.
    pub width: u32,
    /// Height of the bounding box in pixels.
    pub height: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
    /// Per-word bounding boxes from Tesseract TSV output (level 5 = word).
    /// Empty if TSV parsing fails (graceful degradation to text-only).
    pub words: Vec<OcrWord>,
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

        // Attempt to extract word-level bounding boxes via TSV output.
        // TSV format: level page_num block_num par_num line_num word_num left top width height conf text
        // Level 5 = word.  If this fails, we still return the text+confidence
        // with an empty words vec (graceful degradation).
        let words = match instance.get_tsv_text(0) {
            Ok(tsv) => parse_tsv_words(&tsv),
            Err(e) => {
                tracing::warn!(
                    "Tesseract TSV extraction failed (falling back to text-only): {}",
                    e
                );
                Vec::new()
            }
        };

        Ok(OcrResult {
            text,
            confidence,
            words,
        })
    })
    .await
    .context("OCR task panicked")?
}

/// Parse Tesseract TSV output into word-level bounding boxes.
fn parse_tsv_words(tsv: &str) -> Vec<OcrWord> {
    let mut words = Vec::new();
    for line in tsv.lines().skip(1) {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 12 {
            continue;
        }
        // Level 5 = word
        let level: i32 = parts[0].parse().unwrap_or(0);
        if level != 5 {
            continue;
        }
        let x: i32 = parts[6].parse().unwrap_or(0);
        let y: i32 = parts[7].parse().unwrap_or(0);
        let width: u32 = parts[8].parse().unwrap_or(0);
        let height: u32 = parts[9].parse().unwrap_or(0);
        let conf: f32 = parts[10].parse().unwrap_or(0.0);
        let text = parts[11].trim().to_string();
        if text.is_empty() {
            continue;
        }
        words.push(OcrWord {
            text,
            confidence: conf / 100.0,
            x,
            y,
            width,
            height,
        });
    }
    words
}
