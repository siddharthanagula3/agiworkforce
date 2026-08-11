use super::*;

impl ToolExecutor {
    /// Normalize LLM-generated provider names to the canonical IDs expected
    /// by the web API. Exact model IDs resolve through catalog capabilities;
    /// the small match below accepts provider-name aliases only.
    pub(super) fn normalize_media_provider(provider: &str) -> String {
        let normalized = provider.to_lowercase();
        let normalized = normalized.trim();
        let canonical = crate::core::llm::models_config::get_canonicalized_id(normalized);
        if let Some(entry) =
            crate::core::llm::models_config::get_all_model_entries().get(&canonical)
        {
            if entry.capabilities.image_gen {
                return entry.provider.clone();
            }
        }

        match normalized {
            "openai" | "openai-image" => "openai".to_string(),
            "google" | "imagen" => "google".to_string(),
            other => other.to_string(),
        }
    }

    pub(crate) async fn execute_image_generate_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?
            .to_string();
        let provider = args
            .get("provider")
            .and_then(|v| v.as_str())
            .map(Self::normalize_media_provider);
        let size = args
            .get("size")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(ref app) = self.app_handle {
            let request = crate::sys::commands::media::MediaImageRequest {
                prompt: prompt.clone(),
                negative_prompt: None,
                provider,
                model: None,
                size: size.clone(),
                quality: None,
                style: None,
                n: Some(1),
            };

            match crate::sys::commands::media::media_generate_image(app.clone(), request).await {
                Ok(response) => {
                    let result_data = json!({
                        "success": true,
                        "prompt": prompt.clone(),
                        "images": response.images,
                        "provider": response.provider,
                        "model": response.model,
                        "size": size,
                        "cost": response.cost_estimate,
                        "latency_ms": response.latency_ms
                    });
                    Ok(ToolResult {
                        success: true,
                        data: result_data,
                        error: None,
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Image generation failed: {}", e), "success": false }),
                    error: Some(format!("Image generation failed: {}", e)),
                    metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for image generation", "success": false }),
                error: Some("App handle not available for image generation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_video_generate_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?
            .to_string();
        let duration_secs = args
            .get("duration_seconds")
            .or_else(|| args.get("duration_secs"))
            .or_else(|| args.get("duration"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let resolution = args
            .get("resolution")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(ref app) = self.app_handle {
            let provider = args
                .get("provider")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let input_image_url = args
                .get("input_image_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let request = crate::sys::commands::media::MediaVideoRequest {
                prompt: prompt.clone(),
                negative_prompt: None,
                duration_secs,
                resolution: resolution.clone(),
                style: None,
                model: None,
                provider: provider.clone(),
                input_image_url,
            };

            match crate::sys::commands::media::media_generate_video(app.clone(), request).await {
                Ok(response) => {
                    let provider_label = provider.clone().unwrap_or_else(|| "runway".to_string());
                    let result_data = json!({
                        "success": true,
                        "prompt": prompt.clone(),
                        "video_url": response.video_url,
                        "thumbnail_url": response.thumbnail_url,
                        "id": response.id,
                        "status": response.status,
                        "provider": provider_label,
                        "duration_secs": response.duration_secs.or(duration_secs),
                        "resolution": resolution,
                        "cost": response.cost_estimate,
                        "latency_ms": response.latency_ms
                    });
                    Ok(ToolResult {
                        success: true,
                        data: result_data,
                        error: None,
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Video generation failed: {}", e), "success": false }),
                    error: Some(format!("Video generation failed: {}", e)),
                    metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for video generation", "success": false }),
                error: Some("App handle not available for video generation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    pub(crate) async fn execute_image_ocr_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let image_path = args
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?;

        #[cfg(feature = "ocr")]
        {
            use crate::automation::screen::perform_ocr;
            match perform_ocr(image_path).await {
                Ok(text) => Ok(ToolResult {
                    success: true,
                    data: json!({ "text": text, "image_path": image_path }),
                    error: None,
                    metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("OCR failed: {}", e), "success": false }),
                    error: Some(format!("OCR failed: {}", e)),
                    metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
                }),
            }
        }
        #[cfg(not(feature = "ocr"))]
        {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "OCR feature not enabled in build", "success": false }),
                error: Some("OCR feature not enabled in build".to_string()),
                metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
            })
        }
    }

    pub(crate) async fn execute_image_analyze_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let image_path = args
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?
            .to_string();
        let question = args
            .get("question")
            .and_then(|v| v.as_str())
            .unwrap_or("Describe this image in detail")
            .to_string();
        let _detail = args
            .get("detail")
            .and_then(|v| v.as_str())
            .unwrap_or("auto")
            .to_string();

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::vision::vision_answer_question;
            use crate::sys::commands::{AppDatabase, LLMState};
            use tauri::Manager;

            let llm_state = app.state::<LLMState>();
            let db_state = app.state::<AppDatabase>();

            match vision_answer_question(
                image_path.clone(),
                question.clone(),
                None,
                None,
                llm_state,
                db_state,
            )
            .await
            {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "analysis": response.content,
                        "image_path": image_path,
                        "question": question,
                        "model": response.model,
                        "tokens": response.tokens,
                        "processing_time_ms": response.processing_time_ms,
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("image_path".to_string(), json!(image_path)),
                        ("question".to_string(), json!(question)),
                    ]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Image analysis failed: {}", e), "success": false }),
                    error: Some(format!("Image analysis failed: {}", e)),
                    metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for image analysis", "success": false }),
                error: Some("App handle not available for image analysis".to_string()),
                metadata: HashMap::new(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ToolExecutor;

    #[test]
    fn media_model_provider_resolution_uses_catalog_capabilities() {
        let openai_image_model = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.provider == "openai" && entry.capabilities.image_gen)
            .expect("catalog must contain an OpenAI image model");

        assert_eq!(
            ToolExecutor::normalize_media_provider(&openai_image_model.id),
            "openai"
        );
        assert_eq!(
            ToolExecutor::normalize_media_provider("fixture-unknown-media-model"),
            "fixture-unknown-media-model"
        );
    }
}
