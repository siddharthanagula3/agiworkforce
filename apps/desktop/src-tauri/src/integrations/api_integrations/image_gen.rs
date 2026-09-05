use super::{APIError, RequestConfig, Result};
use crate::core::llm::models_config;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// Resolve a provider image model from the canonical catalog.
///
/// An explicitly requested model must be a non-deprecated image model owned by
/// `provider`. When no model is requested, the provider must have exactly one
/// eligible image model; multiple candidates require the caller/UI to choose.
/// Missing or ambiguous metadata fails before a credentialed network request.
fn resolve_image_model(provider: &str, requested_model: Option<&str>) -> Result<String> {
    let models = models_config::get_all_model_entries();

    let entry = if let Some(requested) = requested_model.filter(|model| !model.trim().is_empty()) {
        let canonical = models_config::get_canonicalized_id(requested);
        models.get(&canonical).or_else(|| {
            models
                .values()
                .find(|entry| entry.api_model_id.as_deref() == Some(requested))
        })
    } else if let Some(declared) =
        models_config::get_provider_default_model(provider, models_config::IMAGE_OUTPUT_CAPABILITY)
    {
        let canonical = models_config::get_canonicalized_id(declared);
        models.get(&canonical).or_else(|| {
            models
                .values()
                .find(|entry| entry.api_model_id.as_deref() == Some(declared))
        })
    } else {
        let mut candidates = models
            .values()
            .filter(|entry| {
                entry.provider == provider
                    && entry.capabilities.image_gen
                    && entry.deprecated != Some(true)
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| left.id.cmp(&right.id));
        match candidates.as_slice() {
            [entry] => Some(*entry),
            [] => None,
            _ => {
                return Err(APIError::APIError(format!(
                    "Provider {provider} serves several active catalog image models and the catalog declares no default for it"
                )))
            }
        }
    }
    .filter(|entry| {
        entry.provider == provider
            && entry.capabilities.image_gen
            && entry.deprecated != Some(true)
    })
    .ok_or_else(|| {
        APIError::APIError(format!(
            "No active catalog image model is configured for provider {provider}"
        ))
    })?;

    Ok(entry
        .api_model_id
        .clone()
        .unwrap_or_else(|| entry.id.clone()))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImageProvider {
    OpenAI,
    Google,
    GoogleFast,
}

pub struct ImageGenerationClient {
    client: reqwest::Client,
    provider: ImageProvider,
    api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<ImageSize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<ImageQuality>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageSize {
    #[serde(rename = "256x256")]
    Small,
    #[serde(rename = "512x512")]
    Medium,
    #[serde(rename = "1024x1024")]
    Large,
    #[serde(rename = "1792x1024")]
    Wide,
    #[serde(rename = "1024x1792")]
    Portrait,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ImageQuality {
    Standard,
    HD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationResponse {
    pub images: Vec<GeneratedImage>,
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64_json: Option<String>,
}

impl ImageGenerationClient {
    pub fn new(provider: ImageProvider, config: RequestConfig) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey(format!("{:?}", provider)));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(60));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            provider,
            api_key: config.api_key,
        })
    }

    pub async fn generate_image(
        &self,
        request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        match self.provider {
            ImageProvider::OpenAI => self.generate_with_openai_image(request).await,
            ImageProvider::Google => self.generate_with_google_image(request, false).await,
            ImageProvider::GoogleFast => self.generate_with_google_image(request, true).await,
        }
    }

    async fn generate_with_openai_image(
        &self,
        request: &ImageGenerationRequest,
    ) -> Result<ImageGenerationResponse> {
        let url = "https://api.openai.com/v1/images/generations";

        #[derive(Serialize)]
        struct OpenAIImageRequest {
            prompt: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            model: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            size: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            quality: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            n: Option<u32>,
        }

        let openai_image_request = OpenAIImageRequest {
            prompt: request.prompt.clone(),
            model: Some(resolve_image_model("openai", request.model.as_deref())?),
            size: request.size.map(|s| match s {
                ImageSize::Small => "256x256".to_string(),
                ImageSize::Medium => "512x512".to_string(),
                ImageSize::Large => "1024x1024".to_string(),
                ImageSize::Wide => "1536x1024".to_string(),
                ImageSize::Portrait => "1024x1536".to_string(),
            }),
            quality: request.quality.map(|q| match q {
                ImageQuality::Standard => "medium".to_string(),
                ImageQuality::HD => "high".to_string(),
            }),
            n: request.n,
        };

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&openai_image_request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        self.parse_openai_image_response(response).await
    }

    async fn parse_openai_image_response(
        &self,
        response: reqwest::Response,
    ) -> Result<ImageGenerationResponse> {
        if response.status().is_success() {
            #[derive(Deserialize)]
            struct OpenAIImageResponse {
                created: u64,
                data: Vec<OpenAIImage>,
            }

            #[derive(Deserialize)]
            struct OpenAIImage {
                #[serde(skip_serializing_if = "Option::is_none")]
                url: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                b64_json: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                revised_prompt: Option<String>,
            }

            let openai_image_response: OpenAIImageResponse =
                response.json().await.map_err(APIError::HttpError)?;

            let mut revised_prompt = None;
            let images = openai_image_response
                .data
                .into_iter()
                .map(|img| {
                    if revised_prompt.is_none() && img.revised_prompt.is_some() {
                        revised_prompt = img.revised_prompt.clone();
                    }
                    GeneratedImage {
                        url: img.url,
                        b64_json: img.b64_json,
                    }
                })
                .collect();

            Ok(ImageGenerationResponse {
                images,
                created_at: openai_image_response.created,
                revised_prompt,
            })
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded(
                "OpenAI image generation".to_string(),
            ))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "OpenAI image-generation API error: {}",
                error_text
            )))
        }
    }

    async fn generate_with_google_image(
        &self,
        request: &ImageGenerationRequest,
        _use_lite: bool,
    ) -> Result<ImageGenerationResponse> {
        let model = resolve_image_model("google", request.model.as_deref())?;

        let url =
            format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:predict");

        let aspect_ratio = match request.size.unwrap_or(ImageSize::Large) {
            ImageSize::Small => "1:1",
            ImageSize::Medium => "1:1",
            ImageSize::Large => "1:1",
            ImageSize::Wide => "16:9",
            ImageSize::Portrait => "9:16",
        };

        let quality = request.quality.map(|q| match q {
            ImageQuality::Standard => "standard",
            ImageQuality::HD => "premium",
        });

        let payload = serde_json::json!({
            "prompt": {
                "text": request.prompt,
            },
            "negativePrompt": request.negative_prompt,
            "aspectRatio": aspect_ratio,
            "style": request.style,
            "quality": quality,
            "numberOfImages": request.n.unwrap_or(1),
        });

        let response = self
            .client
            .post(url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", &self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            let value: serde_json::Value = response.json().await.map_err(APIError::HttpError)?;

            let mut images: Vec<GeneratedImage> = Vec::new();
            collect_images_from_value(&value, &mut images);

            if images.is_empty() {
                return Err(APIError::InvalidResponse(
                    "No images returned from Imagen".to_string(),
                ));
            }

            Ok(ImageGenerationResponse {
                images,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
                revised_prompt: None,
            })
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Google Imagen".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Google Imagen API error: {}",
                error_text
            )))
        }
    }

    pub async fn download_image(&self, url: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(APIError::HttpError)
        } else {
            Err(APIError::APIError("Failed to download image".to_string()))
        }
    }
}

fn collect_images_from_value(value: &Value, images: &mut Vec<GeneratedImage>) {
    match value {
        Value::Object(map) => {
            if let Some(inline_data) = map.get("inlineData") {
                if let Some(data) = inline_data
                    .get("data")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                {
                    images.push(GeneratedImage {
                        url: None,
                        b64_json: Some(data),
                    });
                }
            }

            if let Some(image_obj) = map.get("image") {
                if let Some(b64) = image_obj
                    .get("bytesBase64Encoded")
                    .or_else(|| image_obj.get("base64"))
                    .and_then(|v| v.as_str())
                {
                    images.push(GeneratedImage {
                        url: None,
                        b64_json: Some(b64.to_string()),
                    });
                }
                if let Some(url) = image_obj
                    .get("url")
                    .or_else(|| image_obj.get("uri"))
                    .and_then(|v| v.as_str())
                {
                    images.push(GeneratedImage {
                        url: Some(url.to_string()),
                        b64_json: None,
                    });
                }
            }

            for (key, val) in map {
                if ["base64", "b64_json", "bytesBase64Encoded", "image_base64"]
                    .contains(&key.as_str())
                {
                    if let Some(b64) = val.as_str() {
                        images.push(GeneratedImage {
                            url: None,
                            b64_json: Some(b64.to_string()),
                        });
                    }
                }
                if ["url", "uri", "imageUrl", "image_uri"].contains(&key.as_str()) {
                    if let Some(url) = val.as_str() {
                        images.push(GeneratedImage {
                            url: Some(url.to_string()),
                            b64_json: None,
                        });
                    }
                }
                collect_images_from_value(val, images);
            }
        }
        Value::Array(arr) => {
            for val in arr {
                collect_images_from_value(val, images);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_request_serialization() {
        let request = ImageGenerationRequest {
            prompt: "A beautiful landscape".to_string(),
            negative_prompt: Some("blurry, low quality".to_string()),
            model: Some("fixture-image-model".to_string()),
            size: Some(ImageSize::Large),
            style: Some("photorealistic".to_string()),
            quality: Some(ImageQuality::HD),
            n: Some(2),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("landscape"));
        assert!(json.contains("1024x1024"));
    }

    #[test]
    fn image_defaults_derive_from_the_catalog() {
        for provider in ["openai", "google"] {
            let resolved = resolve_image_model(provider, None)
                .unwrap_or_else(|error| panic!("{provider} catalog default failed: {error}"));
            let declared = models_config::get_provider_default_model(
                provider,
                models_config::IMAGE_OUTPUT_CAPABILITY,
            )
            .expect("provider must declare its default image model");
            let entry = models_config::get_all_model_entries()
                .get(&models_config::get_canonicalized_id(declared))
                .expect("the declared default must be a catalog model");
            assert!(entry.capabilities.image_gen && entry.deprecated != Some(true));
            assert_eq!(
                resolved,
                entry.api_model_id.as_deref().unwrap_or(entry.id.as_str())
            );
        }
    }

    #[test]
    fn every_provider_with_several_image_models_declares_a_default() {
        let mut active: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for entry in models_config::get_all_model_entries().values() {
            if entry.capabilities.image_gen && entry.deprecated != Some(true) {
                *active.entry(entry.provider.as_str()).or_default() += 1;
            }
        }
        for (provider, count) in active {
            if count < 2 {
                continue;
            }
            assert!(
                models_config::get_provider_default_model(
                    provider,
                    models_config::IMAGE_OUTPUT_CAPABILITY
                )
                .is_some(),
                "provider {provider} serves {count} active image models and declares no default"
            );
        }
    }

    #[test]
    fn a_single_active_image_model_still_resolves_without_a_declared_default() {
        let single = models_config::get_all_model_entries()
            .values()
            .filter(|entry| entry.capabilities.image_gen && entry.deprecated != Some(true))
            .fold(
                std::collections::HashMap::<String, Vec<&str>>::new(),
                |mut counts, entry| {
                    counts
                        .entry(entry.provider.clone())
                        .or_default()
                        .push(entry.id.as_str());
                    counts
                },
            )
            .into_iter()
            .find(|(provider, ids)| {
                ids.len() == 1
                    && models_config::get_provider_default_model(
                        provider,
                        models_config::IMAGE_OUTPUT_CAPABILITY,
                    )
                    .is_none()
            });
        let Some((provider, _)) = single else {
            return;
        };
        assert!(resolve_image_model(&provider, None).is_ok());
    }

    #[test]
    fn absent_or_unknown_image_models_fail_closed() {
        assert!(resolve_image_model("stability", None).is_err());
        assert!(resolve_image_model("google", Some("fixture-unknown-image-model")).is_err());
    }

    #[test]
    fn test_image_size_serialization() {
        let size = ImageSize::Large;
        let json = serde_json::to_string(&size).unwrap();
        assert!(json.contains("1024x1024"));
    }
}
