use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use std::collections::HashMap;

use crate::core::agi::executors::ExecutorContext;
use crate::core::agi::executors::ToolExecutor;
use crate::core::agi::ExecutionContext;
use crate::sys::commands::media::{
    media_generate_image, media_generate_video, MediaImageRequest, MediaVideoRequest,
};

fn image_request_from_parameters(
    parameters: &HashMap<String, JsonValue>,
) -> Result<MediaImageRequest> {
    let prompt = parameters
        .get("prompt")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing required parameter: prompt"))?
        .to_string();

    Ok(MediaImageRequest {
        prompt,
        negative_prompt: parameters
            .get("negative_prompt")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        provider: parameters
            .get("provider")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        model: parameters
            .get("model")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        size: parameters
            .get("size")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        quality: parameters
            .get("quality")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        style: parameters
            .get("style")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        n: parameters
            .get("n")
            .and_then(JsonValue::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
    })
}

fn video_request_from_parameters(
    parameters: &HashMap<String, JsonValue>,
) -> Result<MediaVideoRequest> {
    let prompt = parameters
        .get("prompt")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing required parameter: prompt"))?
        .to_string();

    Ok(MediaVideoRequest {
        prompt,
        negative_prompt: parameters
            .get("negative_prompt")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        duration_secs: parameters
            .get("duration_seconds")
            .or_else(|| parameters.get("duration_secs"))
            .or_else(|| parameters.get("duration"))
            .and_then(JsonValue::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        resolution: parameters
            .get("resolution")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        style: parameters
            .get("style")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        model: parameters
            .get("model")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        provider: parameters
            .get("provider")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
        input_image_url: parameters
            .get("input_image_url")
            .and_then(JsonValue::as_str)
            .map(str::to_string),
    })
}

/// Executor for media generation tools (image and video generation)
pub struct MediaExecutor;

impl MediaExecutor {
    pub fn new() -> Self {
        Self
    }

    /// Execute image generation
    async fn execute_image_generate(
        &self,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
    ) -> Result<JsonValue> {
        let app_handle = context
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("App handle not available for media generation"))?;
        let request = image_request_from_parameters(parameters)?;
        let response = media_generate_image(app_handle.clone(), request)
            .await
            .map_err(anyhow::Error::msg)?;

        Ok(serde_json::to_value(response)?)
    }

    /// Execute video generation
    async fn execute_video_generate(
        &self,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
    ) -> Result<JsonValue> {
        let app_handle = context
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("App handle not available for media generation"))?;
        let request = video_request_from_parameters(parameters)?;
        let response = media_generate_video(app_handle.clone(), request)
            .await
            .map_err(anyhow::Error::msg)?;

        Ok(serde_json::to_value(response)?)
    }
}

impl Default for MediaExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for MediaExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec![
            "image_generate",
            "video_generate",
            "media_generate_image",
            "media_generate_video",
        ]
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<JsonValue> {
        match tool_name {
            "image_generate" | "media_generate_image" => {
                self.execute_image_generate(parameters, context).await
            }
            "video_generate" | "media_generate_video" => {
                self.execute_video_generate(parameters, context).await
            }
            _ => Err(anyhow::anyhow!("Unknown media tool: {}", tool_name)),
        }
    }

    fn description(&self) -> &'static str {
        "Media generation executor for image and video creation"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_tool_arguments_preserve_catalog_model_without_inventing_defaults() {
        let parameters = HashMap::from([
            ("prompt".to_string(), serde_json::json!("Generate an image")),
            (
                "model".to_string(),
                serde_json::json!("catalog-image-model"),
            ),
        ]);

        let request = image_request_from_parameters(&parameters).unwrap();

        assert_eq!(request.prompt, "Generate an image");
        assert_eq!(request.model.as_deref(), Some("catalog-image-model"));
        assert_eq!(request.provider, None);
        assert_eq!(request.size, None);
        assert_eq!(request.quality, None);
    }

    #[test]
    fn video_tool_arguments_preserve_model_provider_duration_and_resolution() {
        let parameters = HashMap::from([
            ("prompt".to_string(), serde_json::json!("Generate a video")),
            (
                "model".to_string(),
                serde_json::json!("catalog-video-model"),
            ),
            ("provider".to_string(), serde_json::json!("google")),
            ("duration_secs".to_string(), serde_json::json!(8)),
            ("resolution".to_string(), serde_json::json!("1080p")),
        ]);

        let request = video_request_from_parameters(&parameters).unwrap();

        assert_eq!(request.prompt, "Generate a video");
        assert_eq!(request.model.as_deref(), Some("catalog-video-model"));
        assert_eq!(request.provider.as_deref(), Some("google"));
        assert_eq!(request.duration_secs, Some(8));
        assert_eq!(request.resolution.as_deref(), Some("1080p"));
    }
}
