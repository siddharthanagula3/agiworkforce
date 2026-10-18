use crate::core::llm::models_config;
use crate::core::llm::Provider;
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

/// Default vision model, looked up from `models.json` `taskRouting.vision`
/// per the locked rule "NEVER hardcode model IDs". Falls back to OpenAI's
/// default model if `taskRouting.vision` is absent for the provider.
fn default_vision_model() -> String {
    models_config::get_task_model(&Provider::OpenAI, "vision").to_string()
}

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

    let selected_model = request.model.clone().unwrap_or_else(default_vision_model);

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
        local_only: false,
        managed_cloud_only: false,
        // TRUST BOUNDARY (desktop-trust-boundary-01): `VisionRequest.provider`
        // lets the caller name an explicit cloud provider (openai/anthropic/
        // google) with no active-session trust context alongside it. Fails
        // closed to Local via `effective_trust_mode`'s default, an explicit
        // non-local `provider` here is now rejected until this command grows
        // a real trust_mode field threaded from the active session.
        trust_mode: None,
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

pub async fn vision_answer_question(
    image_path: String,
    question: String,
    detail: String,
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
            detail: Some(detail.clone()),
        }],
        provider,
        model,
        temperature: Some(0.5),
        max_tokens: Some(500),
        detail_level: Some(detail),
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
