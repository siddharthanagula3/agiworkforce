use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest,
};
use crate::sys::commands::{AppDatabase, LLMState};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat as ImgFormat};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::State;

const MAX_IMAGE_DIMENSION: u32 = 2048;
const JPEG_QUALITY: u8 = 85;
const DEFAULT_VISION_MODEL: &str = "gpt-5.2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionRequest {
    pub prompt: String,
    pub images: Vec<VisionImage>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub detail_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionImage {
    pub source_type: String,

    pub source: String,

    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisionResponse {
    pub content: String,
    pub model: String,
    pub tokens: Option<u32>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub cost: Option<f64>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageComparisonResult {
    pub similarity_score: f32,
    pub differences_description: String,
    pub visual_diff_highlighted: Option<String>,
    pub model: String,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualElementLocation {
    pub description: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
}

#[tauri::command]
pub async fn vision_send_message(
    request: VisionRequest,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisionResponse, String> {
    let start = std::time::Instant::now();
    tracing::info!(
        "Processing vision request with {} images",
        request.images.len()
    );

    let mut content_parts = Vec::new();

    for (idx, vision_img) in request.images.iter().enumerate() {
        let image_data = match vision_img.source_type.as_str() {
            "path" => load_image_from_path(&vision_img.source)?,
            "base64" => decode_base64_image(&vision_img.source)?,
            "capture_id" => load_image_from_capture(&vision_img.source, &db).await?,
            _ => return Err(format!("Unknown source_type: {}", vision_img.source_type)),
        };

        let optimized = optimize_image_for_vision(&image_data)?;
        let optimized_size = optimized.data.len();
        let optimized_format = optimized.format;

        let detail = vision_img
            .detail
            .as_deref()
            .or(request.detail_level.as_deref())
            .unwrap_or("auto");
        let detail_enum = parse_detail_level(detail)?;

        let image_input = ImageInput {
            data: optimized.data,
            format: optimized_format,
            detail: detail_enum,
        };

        content_parts.push(ContentPart::Image { image: image_input });

        tracing::debug!(
            "Image {} optimized: {} bytes, format: {:?}, detail: {:?}",
            idx,
            optimized_size,
            optimized_format,
            detail_enum
        );
    }

    content_parts.insert(
        0,
        ContentPart::Text {
            text: request.prompt.clone(),
        },
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: request.prompt.clone(),
        multimodal_content: Some(content_parts),
        tool_calls: None,
        tool_call_id: None,
    }];

    let selected_model = request
        .model
        .clone()
        .unwrap_or_else(|| DEFAULT_VISION_MODEL.to_string());

    let llm_request = LLMRequest {
        messages,
        model: selected_model.clone(),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    };

    let provider = request.provider.as_deref().and_then(|p| match p {
        "openai" => Some(crate::core::llm::Provider::OpenAI),
        "anthropic" => Some(crate::core::llm::Provider::Anthropic),
        "google" => Some(crate::core::llm::Provider::Google),
        "ollama" => Some(crate::core::llm::Provider::Ollama),
        _ => None,
    });

    let preferences = crate::core::llm::llm_router::RouterPreferences {
        provider,
        model: request.model.clone(),
        strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
        context: None,
        prefer_cloud_credits: false,
    };

    let candidates = {
        let router = state.router.read().await;
        router.candidates(&llm_request, &preferences)
    };

    if candidates.is_empty() {
        return Err("No vision-capable LLM providers are configured.".to_string());
    }

    let mut last_error: Option<anyhow::Error> = None;

    for candidate in candidates {
        let res = {
            let router = state.router.read().await;
            router.invoke_candidate(&candidate, &llm_request).await
        };
        match res {
            Ok(outcome) => {
                let processing_time = start.elapsed().as_millis() as u64;
                tracing::info!(
                    "Vision request completed in {}ms, model: {}, cost: ${:.6}",
                    processing_time,
                    outcome.response.model,
                    outcome.response.cost.unwrap_or(0.0)
                );

                return Ok(VisionResponse {
                    content: outcome.response.content,
                    model: outcome.response.model,
                    tokens: outcome.response.tokens,
                    prompt_tokens: outcome.response.prompt_tokens,
                    completion_tokens: outcome.response.completion_tokens,
                    cost: outcome.response.cost,
                    processing_time_ms: processing_time,
                });
            }
            Err(err) => {
                last_error = Some(err);
            }
        }
    }

    Err(last_error
        .unwrap_or_else(|| anyhow::anyhow!("All providers failed"))
        .to_string())
}

#[tauri::command]
pub async fn vision_analyze_screenshot(
    capture_id: String,
    prompt: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisionResponse, String> {
    tracing::info!("Analyzing screenshot: {}", capture_id);

    let default_prompt = "Describe this screenshot in detail. What do you see?".to_string();

    let request = VisionRequest {
        prompt: prompt.unwrap_or(default_prompt),
        images: vec![VisionImage {
            source_type: "capture_id".to_string(),
            source: capture_id,
            detail: Some("high".to_string()),
        }],
        provider,
        model,
        temperature: Some(0.3),
        max_tokens: Some(1000),
        detail_level: Some("high".to_string()),
    };

    vision_send_message(request, state, db).await
}

#[tauri::command]
pub async fn vision_extract_text(
    image_path: String,
    provider: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisionResponse, String> {
    tracing::info!(
        "Extracting text from image using vision model: {}",
        image_path
    );

    let prompt = "Extract all visible text from this image. Maintain the original formatting and structure as much as possible. Output only the extracted text without any additional commentary.".to_string();

    let request = VisionRequest {
        prompt,
        images: vec![VisionImage {
            source_type: "path".to_string(),
            source: image_path,
            detail: Some("high".to_string()),
        }],
        provider,
        model: Some(DEFAULT_VISION_MODEL.to_string()),
        temperature: Some(0.0),
        max_tokens: Some(2000),
        detail_level: Some("high".to_string()),
    };

    vision_send_message(request, state, db).await
}

#[tauri::command]
pub async fn vision_compare_images(
    image_path_1: String,
    image_path_2: String,
    comparison_type: Option<String>,
    provider: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<ImageComparisonResult, String> {
    tracing::info!("Comparing images: {} vs {}", image_path_1, image_path_2);

    let comp_type = comparison_type.unwrap_or_else(|| "changes".to_string());

    let prompt = match comp_type.as_str() {
        "visual_diff" => {
            "Compare these two images and describe all visual differences. Be precise about locations, colors, and changes.".to_string()
        }
        "similarity" => {
            "Analyze these two images and rate their similarity on a scale of 0-100. Explain what's similar and what's different.".to_string()
        }
        "changes" => {
            "Compare the first image (before) with the second image (after). List all changes, additions, and removals you can identify.".to_string()
        }
        _ => {
            "Compare these two images and describe their differences.".to_string()
        }
    };

    let request = VisionRequest {
        prompt,
        images: vec![
            VisionImage {
                source_type: "path".to_string(),
                source: image_path_1,
                detail: Some("high".to_string()),
            },
            VisionImage {
                source_type: "path".to_string(),
                source: image_path_2,
                detail: Some("high".to_string()),
            },
        ],
        provider,
        model: Some(DEFAULT_VISION_MODEL.to_string()),
        temperature: Some(0.3),
        max_tokens: Some(1500),
        detail_level: Some("high".to_string()),
    };

    let response = vision_send_message(request, state, db).await?;

    let similarity_score = if comp_type == "similarity" {
        extract_similarity_score(&response.content)
    } else {
        0.0
    };

    Ok(ImageComparisonResult {
        similarity_score,
        differences_description: response.content,
        visual_diff_highlighted: None,
        model: response.model,
        cost: response.cost,
    })
}

#[tauri::command]
pub async fn vision_locate_element(
    capture_id: String,
    element_description: String,
    provider: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisualElementLocation, String> {
    tracing::info!(
        "Locating element '{}' in capture {}",
        element_description,
        capture_id
    );

    let prompt = format!(
        "In this screenshot, locate the element described as: '{}'.
         Provide the approximate bounding box coordinates (x, y, width, height)
         and your confidence level (0-100). Format your response as JSON:
         {{\"x\": 100, \"y\": 200, \"width\": 50, \"height\": 30, \"confidence\": 95}}",
        element_description
    );

    let request = VisionRequest {
        prompt,
        images: vec![VisionImage {
            source_type: "capture_id".to_string(),
            source: capture_id,
            detail: Some("high".to_string()),
        }],
        provider,
        model: Some(DEFAULT_VISION_MODEL.to_string()),
        temperature: Some(0.0),
        max_tokens: Some(500),
        detail_level: Some("high".to_string()),
    };

    let response = vision_send_message(request, state, db).await?;

    let location = parse_element_location(&response.content, &element_description)?;

    Ok(location)
}

#[tauri::command]
pub async fn vision_describe_ui_elements(
    capture_id: String,
    provider: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisionResponse, String> {
    tracing::info!("Describing UI elements in capture: {}", capture_id);

    let prompt =
        "Analyze this screenshot and provide a structured description of all visible UI elements.
                  For each element, describe: type (button, textbox, label, etc.), text content,
                  approximate location (top-left, center, bottom-right, etc.), and visual state
                  (enabled, disabled, selected, etc.). Format as a structured list."
            .to_string();

    let request = VisionRequest {
        prompt,
        images: vec![VisionImage {
            source_type: "capture_id".to_string(),
            source: capture_id,
            detail: Some("high".to_string()),
        }],
        provider,
        model: Some(DEFAULT_VISION_MODEL.to_string()),
        temperature: Some(0.3),
        max_tokens: Some(2000),
        detail_level: Some("high".to_string()),
    };

    vision_send_message(request, state, db).await
}

#[tauri::command]
pub async fn vision_answer_question(
    image_path: String,
    question: String,
    provider: Option<String>,
    model: Option<String>,
    state: State<'_, LLMState>,
    db: State<'_, AppDatabase>,
) -> Result<VisionResponse, String> {
    tracing::info!("Answering visual question: {}", question);

    let request = VisionRequest {
        prompt: question,
        images: vec![VisionImage {
            source_type: "path".to_string(),
            source: image_path,
            detail: Some("auto".to_string()),
        }],
        provider,
        model,
        temperature: Some(0.5),
        max_tokens: Some(500),
        detail_level: Some("auto".to_string()),
    };

    vision_send_message(request, state, db).await
}

fn load_image_from_path(file_path: &str) -> Result<DynamicImage, String> {
    let path = std::path::Path::new(file_path);
    if !path.exists() || !path.is_file() {
        return Err(format!("Invalid image path: {}", file_path));
    }
    // Reject paths with .. to prevent directory traversal
    if file_path.contains("..") {
        return Err("Path traversal not allowed".to_string());
    }
    image::open(file_path).map_err(|e| format!("Failed to load image from path: {}", e))
}

fn decode_base64_image(base64_str: &str) -> Result<DynamicImage, String> {
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        base64_str.trim(),
    )
    .map_err(|e| format!("Failed to decode base64 image: {}", e))?;

    image::load_from_memory(&bytes).map_err(|e| format!("Failed to load image from base64: {}", e))
}

async fn load_image_from_capture(
    capture_id: &str,
    db: &State<'_, AppDatabase>,
) -> Result<DynamicImage, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM captures WHERE id = ?1",
            rusqlite::params![capture_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get capture: {}", e))?;

    load_image_from_path(&file_path)
}

#[derive(Debug)]
struct OptimizedImage {
    data: Vec<u8>,
    format: ImageFormat,
}

fn optimize_image_for_vision(image: &DynamicImage) -> Result<OptimizedImage, String> {
    let (width, height) = image.dimensions();
    let needs_resize = width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;

    let processed = if needs_resize {
        let scale = MAX_IMAGE_DIMENSION as f32 / width.max(height) as f32;
        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;

        tracing::debug!(
            "Resizing image from {}x{} to {}x{}",
            width,
            height,
            new_width,
            new_height
        );

        image.resize(new_width, new_height, FilterType::Lanczos3)
    } else {
        image.clone()
    };

    let (format, img_format) = if image.color().has_alpha() {
        (ImageFormat::Png, ImgFormat::Png)
    } else {
        (ImageFormat::Jpeg, ImgFormat::Jpeg)
    };

    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut bytes);

    if matches!(img_format, ImgFormat::Jpeg) {
        let mut encoder = JpegEncoder::new_with_quality(&mut cursor, JPEG_QUALITY);
        encoder
            .encode_image(&processed)
            .map_err(|e| format!("Failed to encode image: {}", e))?;
    } else {
        processed
            .write_to(&mut cursor, img_format)
            .map_err(|e| format!("Failed to encode image: {}", e))?;
    }

    tracing::debug!(
        "Optimized image: {} bytes, format: {:?}",
        bytes.len(),
        format
    );

    Ok(OptimizedImage {
        data: bytes,
        format,
    })
}

fn parse_detail_level(detail: &str) -> Result<ImageDetail, String> {
    match detail.to_lowercase().as_str() {
        "low" => Ok(ImageDetail::Low),
        "high" => Ok(ImageDetail::High),
        "auto" => Ok(ImageDetail::Auto),
        _ => Err(format!("Invalid detail level: {}", detail)),
    }
}

fn extract_similarity_score(text: &str) -> f32 {
    use regex::Regex;

    if let Ok(re) = Regex::new(r"(\d+)%") {
        if let Some(caps) = re.captures(text) {
            if let Some(score_str) = caps.get(1) {
                if let Ok(score) = score_str.as_str().parse::<f32>() {
                    return score;
                }
            }
        }
    }

    if let Ok(re) = Regex::new(r"(\d+)\s+out\s+of\s+100") {
        if let Some(caps) = re.captures(text) {
            if let Some(score_str) = caps.get(1) {
                if let Ok(score) = score_str.as_str().parse::<f32>() {
                    return score;
                }
            }
        }
    }

    // AUDIT-P3-001: Use safe pattern matching instead of unwrap()
    if let Ok(re) = Regex::new(r"0\.\d+") {
        if let Some(caps) = re.captures(text) {
            if let Some(match_str) = caps.get(0) {
                if let Ok(score) = match_str.as_str().parse::<f32>() {
                    return score * 100.0;
                }
            }
        }
    }

    0.0
}

fn parse_element_location(text: &str, description: &str) -> Result<VisualElementLocation, String> {
    use regex::Regex;

    let re = Regex::new(r"\{[^}]+\}").map_err(|e| format!("Failed to create regex: {}", e))?;

    if let Some(json_match) = re.find(text) {
        let json_str = json_match.as_str();

        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            let x = parsed["x"].as_i64().unwrap_or(0) as i32;
            let y = parsed["y"].as_i64().unwrap_or(0) as i32;
            let width = parsed["width"].as_u64().unwrap_or(0) as u32;
            let height = parsed["height"].as_u64().unwrap_or(0) as u32;
            let confidence = parsed["confidence"].as_f64().unwrap_or(0.0) as f32;

            return Ok(VisualElementLocation {
                description: description.to_string(),
                x,
                y,
                width,
                height,
                confidence,
            });
        }
    }

    Err("Failed to parse element location from response".to_string())
}
