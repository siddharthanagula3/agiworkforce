use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::AppDatabase;

#[cfg(feature = "ocr")]
use rusqlite::OptionalExtension;
#[cfg(feature = "ocr")]
use std::time::{Instant, SystemTime, UNIX_EPOCH};
#[cfg(feature = "ocr")]
use tesseract::{PageSegMode, Tesseract};
#[cfg(feature = "ocr")]
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordData {
    pub text: String,
    pub confidence: f32,
    pub bbox: BoundingBox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResult {
    pub id: String,
    pub capture_id: String,
    pub text: String,
    pub confidence: f32,
    pub words: Vec<WordData>,
    pub processing_time_ms: u64,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Language {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageDetection {
    pub language: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLanguageResult {
    pub detected_languages: Vec<LanguageDetection>,
    pub text: String,
    pub confidence: f32,
}

/// Helper function to preprocess image for better OCR accuracy
#[cfg(feature = "ocr")]
fn preprocess_image(image_path: &str) -> Result<String, String> {
    use image::{DynamicImage, GenericImageView, ImageBuffer, Luma};
    use imageproc::contrast::adaptive_threshold;
    use imageproc::filter::gaussian_blur_f32;

    tracing::debug!("Preprocessing image: {}", image_path);

    // Load image
    let img = image::open(image_path)
        .map_err(|e| format!("Failed to load image for preprocessing: {}", e))?;

    // Convert to grayscale
    let gray = img.to_luma8();

    // Apply Gaussian blur to reduce noise
    let blurred = gaussian_blur_f32(&gray, 1.0);

    // Apply adaptive thresholding for better contrast
    let threshold_block_size = 15;
    let processed = adaptive_threshold(&blurred, threshold_block_size);

    // Deskew if needed (basic rotation correction)
    // Note: Full deskewing would require additional dependencies like skimage equivalent
    // For now, we'll apply basic image enhancement

    // Auto-contrast enhancement
    let enhanced = enhance_contrast(&processed);

    // Save preprocessed image to temp file
    let temp_path = std::env::temp_dir().join(format!("ocr_preprocessed_{}.png", Uuid::new_v4()));
    enhanced
        .save(&temp_path)
        .map_err(|e| format!("Failed to save preprocessed image: {}", e))?;

    tracing::debug!("Preprocessed image saved to: {:?}", temp_path);

    Ok(temp_path.to_str().unwrap().to_string())
}

/// Helper function to enhance image contrast
#[cfg(feature = "ocr")]
fn enhance_contrast(img: &ImageBuffer<Luma<u8>, Vec<u8>>) -> ImageBuffer<Luma<u8>, Vec<u8>> {
    use imageproc::contrast::stretch_contrast;

    // Stretch contrast to full range (0-255)
    let lower = *img.iter().min().unwrap_or(&0);
    let upper = *img.iter().max().unwrap_or(&255);

    stretch_contrast(img, lower, upper)
}

/// Helper function to detect multiple languages in an image
#[cfg(feature = "ocr")]
fn detect_languages(image_path: &str) -> Result<Vec<LanguageDetection>, String> {
    use tesseract::PageSegMode;

    tracing::debug!("Detecting languages in image: {}", image_path);

    // Initialize Tesseract with OSD (Orientation and Script Detection) mode
    let mut tess = Tesseract::new(None, Some("osd")).map_err(|e| {
        format!(
            "Failed to initialize Tesseract for language detection: {}",
            e
        )
    })?;

    tess.set_image(image_path)
        .map_err(|e| format!("Failed to set image for language detection: {}", e))?;

    tess.set_page_seg_mode(PageSegMode::PsmOsdOnly);

    // Get orientation and script detection data
    let osd_text = tess
        .get_text()
        .map_err(|e| format!("Failed to get OSD data: {}", e))?;

    // Parse OSD output to extract language information
    let mut detected_languages = Vec::new();

    // Note: OSD primarily detects scripts, not specific languages
    // For actual multi-language detection, we would need to run OCR with multiple language packs
    // and compare confidence scores

    // Fallback: Try common language combinations
    let language_combinations = vec![
        ("eng", "English"),
        ("spa", "Spanish"),
        ("fra", "French"),
        ("deu", "German"),
    ];

    for (lang_code, _lang_name) in language_combinations {
        if let Ok(mut lang_tess) = Tesseract::new(None, Some(lang_code)) {
            if lang_tess.set_image(image_path).is_ok() {
                if let Ok(conf) = lang_tess.mean_text_conf() {
                    if conf > 30 {
                        // Only include if confidence is reasonable
                        detected_languages.push(LanguageDetection {
                            language: lang_code.to_string(),
                            confidence: conf as f32,
                        });
                    }
                }
            }
        }
    }

    // Sort by confidence (highest first)
    detected_languages.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());

    tracing::debug!("Detected {} languages", detected_languages.len());

    Ok(detected_languages)
}

/// Process image with OCR
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_process_image(
    db: State<'_, AppDatabase>,
    capture_id: String,
    image_path: String,
    language: Option<String>,
) -> Result<OCRResult, String> {
    tracing::info!("Processing OCR for image: {}", image_path);
    let start = Instant::now();

    let lang = language.unwrap_or_else(|| "eng".to_string());

    // Initialize Tesseract
    let mut tess = Tesseract::new(None, Some(&lang))
        .map_err(|e| format!("Failed to initialize Tesseract: {}", e))?;

    // Set image
    tess.set_image(&image_path)
        .map_err(|e| format!("Failed to set image: {}", e))?;

    // Set page segmentation mode to automatic
    tess.set_page_seg_mode(PageSegMode::PsmAuto);

    // Extract text
    let text = tess
        .get_text()
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    // Get confidence
    let confidence = tess.mean_text_conf() as f32;

    // Extract word-level data
    let words = extract_word_data(&tess)?;

    let processing_time = start.elapsed().as_millis() as u64;

    // Create OCR result
    let ocr_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Save to database
    let words_json =
        serde_json::to_string(&words).map_err(|e| format!("Failed to serialize words: {}", e))?;

    let conn =
        db.conn.lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Update capture with OCR text
    conn.execute(
        "UPDATE captures SET ocr_text = ?1, ocr_confidence = ?2 WHERE id = ?3",
        rusqlite::params![&text, confidence, &capture_id],
    )
    .map_err(|e| format!("Failed to update capture: {}", e))?;

    // Insert OCR result
    conn.execute(
        "INSERT INTO ocr_results (id, capture_id, language, text, confidence, bounding_boxes, processing_time_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            &ocr_id,
            &capture_id,
            &lang,
            &text,
            confidence,
            &words_json,
            processing_time as i64,
            timestamp,
        ],
    )
    .map_err(|e| format!("Failed to insert OCR result: {}", e))?;

    tracing::info!(
        "OCR processing completed in {}ms with confidence {:.2}%",
        processing_time,
        confidence
    );

    Ok(OCRResult {
        id: ocr_id,
        capture_id,
        text,
        confidence,
        words,
        processing_time_ms: processing_time,
        language: lang,
    })
}

/// Process specific region of image with OCR
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_process_region(
    image_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    language: Option<String>,
) -> Result<OCRResult, String> {
    tracing::info!(
        "Processing OCR for region: ({}, {}) {}x{}",
        x,
        y,
        width,
        height
    );
    let start = Instant::now();

    let lang = language.unwrap_or_else(|| "eng".to_string());

    // Load and crop image
    let img = image::open(&image_path).map_err(|e| format!("Failed to load image: {}", e))?;

    let cropped = image::imageops::crop_imm(&img.to_rgba8(), x, y, width, height);

    // Save temp cropped image
    let temp_path = std::env::temp_dir().join(format!("ocr_temp_{}.png", Uuid::new_v4()));
    cropped
        .to_image()
        .save(&temp_path)
        .map_err(|e| format!("Failed to save temp image: {}", e))?;

    // Initialize Tesseract
    let mut tess = Tesseract::new(None, Some(&lang))
        .map_err(|e| format!("Failed to initialize Tesseract: {}", e))?;

    tess.set_image(temp_path.to_str().unwrap())
        .map_err(|e| format!("Failed to set image: {}", e))?;

    tess.set_page_seg_mode(PageSegMode::PsmAuto);

    // Extract text
    let text = tess
        .get_text()
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    let confidence = tess.mean_text_conf() as f32;
    let words = extract_word_data(&tess)?;

    let processing_time = start.elapsed().as_millis() as u64;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    tracing::info!(
        "OCR region processing completed in {}ms with confidence {:.2}%",
        processing_time,
        confidence
    );

    Ok(OCRResult {
        id: Uuid::new_v4().to_string(),
        capture_id: String::new(), // No capture_id for region-only OCR
        text,
        confidence,
        words,
        processing_time_ms: processing_time,
        language: lang,
    })
}

/// Get available Tesseract languages
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_get_languages() -> Result<Vec<Language>, String> {
    tracing::info!("Getting available OCR languages");

    // Common languages that Tesseract supports
    let languages = vec![
        Language {
            code: "eng".to_string(),
            name: "English".to_string(),
        },
        Language {
            code: "spa".to_string(),
            name: "Spanish".to_string(),
        },
        Language {
            code: "fra".to_string(),
            name: "French".to_string(),
        },
        Language {
            code: "deu".to_string(),
            name: "German".to_string(),
        },
        Language {
            code: "ita".to_string(),
            name: "Italian".to_string(),
        },
        Language {
            code: "por".to_string(),
            name: "Portuguese".to_string(),
        },
        Language {
            code: "rus".to_string(),
            name: "Russian".to_string(),
        },
        Language {
            code: "jpn".to_string(),
            name: "Japanese".to_string(),
        },
        Language {
            code: "chi_sim".to_string(),
            name: "Chinese (Simplified)".to_string(),
        },
        Language {
            code: "chi_tra".to_string(),
            name: "Chinese (Traditional)".to_string(),
        },
        Language {
            code: "kor".to_string(),
            name: "Korean".to_string(),
        },
        Language {
            code: "ara".to_string(),
            name: "Arabic".to_string(),
        },
        Language {
            code: "hin".to_string(),
            name: "Hindi".to_string(),
        },
    ];

    Ok(languages)
}

/// Get OCR result for a capture
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_get_result(
    db: State<'_, AppDatabase>,
    capture_id: String,
) -> Result<Option<OCRResult>, String> {
    tracing::info!("Getting OCR result for capture: {}", capture_id);

    let conn =
        db.conn.lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

    let result = conn
        .query_row(
            "SELECT id, language, text, confidence, bounding_boxes, processing_time_ms
             FROM ocr_results
             WHERE capture_id = ?1
             ORDER BY created_at DESC
             LIMIT 1",
            rusqlite::params![&capture_id],
            |row| {
                let words_json: String = row.get(4)?;
                let words: Vec<WordData> = serde_json::from_str(&words_json).unwrap_or_default();

                Ok(OCRResult {
                    id: row.get(0)?,
                    capture_id: capture_id.clone(),
                    text: row.get(2)?,
                    confidence: row.get(3)?,
                    words,
                    processing_time_ms: row.get::<_, i64>(5)? as u64,
                    language: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to query OCR result: {}", e))?;

    Ok(result)
}

/// Process image with OCR and extract word-level bounding boxes
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_process_with_boxes(
    image_path: String,
    language: Option<String>,
    preprocess: Option<bool>,
) -> Result<OCRResult, String> {
    tracing::info!(
        "Processing OCR with bounding boxes for image: {}",
        image_path
    );
    let start = Instant::now();

    let lang = language.unwrap_or_else(|| "eng".to_string());
    let should_preprocess = preprocess.unwrap_or(false);

    // Preprocess image if requested
    let processing_path = if should_preprocess {
        preprocess_image(&image_path)?
    } else {
        image_path.clone()
    };

    // Initialize Tesseract
    let mut tess = Tesseract::new(None, Some(&lang))
        .map_err(|e| format!("Failed to initialize Tesseract: {}", e))?;

    tess.set_image(&processing_path)
        .map_err(|e| format!("Failed to set image: {}", e))?;

    tess.set_page_seg_mode(PageSegMode::PsmAuto);

    // Extract text
    let text = tess
        .get_text()
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    let confidence = tess.mean_text_conf() as f32;

    // Extract word-level bounding boxes
    let words = extract_word_data(&tess)?;

    let processing_time = start.elapsed().as_millis() as u64;

    // Clean up preprocessed image if it was created
    if should_preprocess && processing_path != image_path {
        let _ = std::fs::remove_file(&processing_path);
    }

    tracing::info!(
        "OCR processing with boxes completed in {}ms with {} words",
        processing_time,
        words.len()
    );

    Ok(OCRResult {
        id: Uuid::new_v4().to_string(),
        capture_id: String::new(),
        text,
        confidence,
        words,
        processing_time_ms: processing_time,
        language: lang,
    })
}

/// Detect multiple languages in an image
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_detect_languages(image_path: String) -> Result<Vec<LanguageDetection>, String> {
    tracing::info!("Detecting languages in image: {}", image_path);

    let detected = detect_languages(&image_path)?;

    tracing::info!("Detected {} languages", detected.len());

    Ok(detected)
}

/// Process image with multi-language detection and OCR
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_process_multi_language(
    image_path: String,
    preprocess: Option<bool>,
) -> Result<MultiLanguageResult, String> {
    tracing::info!(
        "Processing OCR with multi-language detection: {}",
        image_path
    );
    let start = Instant::now();

    let should_preprocess = preprocess.unwrap_or(false);

    // Preprocess image if requested
    let processing_path = if should_preprocess {
        preprocess_image(&image_path)?
    } else {
        image_path.clone()
    };

    // Detect languages
    let detected_languages = detect_languages(&processing_path)?;

    // Use the most confident language for OCR
    let primary_language = detected_languages
        .first()
        .map(|l| l.language.clone())
        .unwrap_or_else(|| "eng".to_string());

    // Initialize Tesseract with primary language
    let mut tess = Tesseract::new(None, Some(&primary_language))
        .map_err(|e| format!("Failed to initialize Tesseract: {}", e))?;

    tess.set_image(&processing_path)
        .map_err(|e| format!("Failed to set image: {}", e))?;

    tess.set_page_seg_mode(PageSegMode::PsmAuto);

    // Extract text
    let text = tess
        .get_text()
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    let confidence = tess.mean_text_conf() as f32;

    let processing_time = start.elapsed().as_millis() as u64;

    // Clean up preprocessed image if it was created
    if should_preprocess && processing_path != image_path {
        let _ = std::fs::remove_file(&processing_path);
    }

    tracing::info!(
        "Multi-language OCR completed in {}ms, primary language: {}",
        processing_time,
        primary_language
    );

    Ok(MultiLanguageResult {
        detected_languages,
        text,
        confidence,
    })
}

/// Preprocess an image for better OCR accuracy
#[cfg(feature = "ocr")]
#[tauri::command]
pub async fn ocr_preprocess_image(
    image_path: String,
    output_path: Option<String>,
) -> Result<String, String> {
    tracing::info!("Preprocessing image for OCR: {}", image_path);

    let preprocessed_path = preprocess_image(&image_path)?;

    // If output path is specified, move the file there
    if let Some(output) = output_path {
        std::fs::copy(&preprocessed_path, &output)
            .map_err(|e| format!("Failed to copy preprocessed image: {}", e))?;
        let _ = std::fs::remove_file(&preprocessed_path);
        Ok(output)
    } else {
        Ok(preprocessed_path)
    }
}

/// Helper function to extract word-level data from Tesseract
#[cfg(feature = "ocr")]
fn extract_word_data(tess: &Tesseract) -> Result<Vec<WordData>, String> {
    use tesseract::PageIteratorLevel;

    let mut words = Vec::new();

    // Get word-level iterator
    let boxes = tess
        .get_component_boxes(PageIteratorLevel::Word, true)
        .map_err(|e| format!("Failed to get word boxes: {}", e))?;

    for bbox in boxes {
        // Extract word text and bounding box
        let word_text = bbox.text.trim().to_string();

        // Skip empty words
        if word_text.is_empty() {
            continue;
        }

        // Calculate word confidence (default to overall confidence if not available)
        let word_confidence = bbox.confidence as f32;

        words.push(WordData {
            text: word_text,
            confidence: word_confidence,
            bbox: BoundingBox {
                x: bbox.x,
                y: bbox.y,
                width: bbox.w as u32,
                height: bbox.h as u32,
            },
        });
    }

    tracing::debug!("Extracted {} words with bounding boxes", words.len());
    Ok(words)
}

// Stub implementations when OCR feature is disabled
#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_process_image(
    _db: State<'_, AppDatabase>,
    _capture_id: String,
    _image_path: String,
    _language: Option<String>,
) -> Result<OCRResult, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_process_region(
    _image_path: String,
    _x: u32,
    _y: u32,
    _width: u32,
    _height: u32,
    _language: Option<String>,
) -> Result<OCRResult, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_get_languages() -> Result<Vec<Language>, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_get_result(
    _db: State<'_, AppDatabase>,
    _capture_id: String,
) -> Result<Option<OCRResult>, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_process_with_boxes(
    _image_path: String,
    _language: Option<String>,
    _preprocess: Option<bool>,
) -> Result<OCRResult, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_detect_languages(_image_path: String) -> Result<Vec<LanguageDetection>, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_process_multi_language(
    _image_path: String,
    _preprocess: Option<bool>,
) -> Result<MultiLanguageResult, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}

#[cfg(not(feature = "ocr"))]
#[tauri::command]
pub async fn ocr_preprocess_image(
    _image_path: String,
    _output_path: Option<String>,
) -> Result<String, String> {
    Err("OCR feature not enabled. Please rebuild with --features ocr".to_string())
}
