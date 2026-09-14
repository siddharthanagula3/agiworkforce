//! Managed Cloud image generation: the same `/api/media/image/generate` route
//! the web composer and the mobile client call.
//!
//! The model is never a literal here. `/api/media/availability` publishes which
//! catalogue image models this deployment can actually execute, and the CLI
//! picks from that admission exactly as the web composer does.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError};
use crate::platform::runtime::session::PrivacyMode;

pub const IMAGE_GENERATE_PATH: &str = "/api/media/image/generate";
pub const MEDIA_AVAILABILITY_PATH: &str = "/api/media/availability";

/// The route budgets 60s for the provider call and adds its own overhead, so
/// the client waits longer than the shared 20s account timeout.
const IMAGE_TIMEOUT: Duration = Duration::from_secs(150);

const SLUG_MAX_CHARS: usize = 32;
const DEFAULT_STEM: &str = "image";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    pub n: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct GeneratedImage {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub b64_json: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ImageGenerationResponse {
    #[serde(default)]
    pub success: bool,
    #[serde(default)]
    pub images: Vec<GeneratedImage>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ImageModelAdmission {
    pub model_id: String,
    pub name: String,
    pub kind: String,
    pub provider: String,
    pub state: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct MediaAvailability {
    #[serde(default)]
    pub models: Vec<ImageModelAdmission>,
}

/// What one `/image` turn produced: the files on disk and the model that drew
/// them.
#[derive(Debug, Clone, PartialEq)]
pub struct ImageGeneration {
    pub paths: Vec<PathBuf>,
    pub model: String,
    pub provider: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImageRequestOptions {
    pub prompt: String,
    pub count: u8,
    /// Left unset unless the user passed `--size`, so the route's own default
    /// stays the one place a default size is written down.
    pub size: Option<String>,
    pub quality: Option<String>,
    pub model: Option<String>,
    pub out: Option<PathBuf>,
}

/// Identifies this image operation to the managed-usage ledger. A retry of the
/// same operation settles the same reservation rather than charging twice.
pub fn idempotency_key(operation_id: Uuid) -> String {
    format!("agi.media.cli.image.{operation_id}")
}

/// The catalogue model this deployment will actually execute.
///
/// `requested` is the user's `--model`; without it the first admitted image
/// model wins, which is the same order the availability endpoint publishes to
/// the web composer.
pub fn choose_image_model(
    availability: &MediaAvailability,
    requested: Option<&str>,
) -> Result<ImageModelAdmission, String> {
    let images: Vec<&ImageModelAdmission> = availability
        .models
        .iter()
        .filter(|model| model.kind == "image")
        .collect();

    if let Some(requested) = requested {
        let Some(model) = images.iter().find(|model| model.model_id == requested) else {
            return Err(format!(
                "'{requested}' is not an image model in your account's catalogue. Run `agi image \
                 --list-models` to see what this deployment can generate with."
            ));
        };
        if model.state != "enabled" {
            return Err(format!(
                "{} is in the catalogue but not available here ({}).",
                model.name, model.state
            ));
        }
        return Ok((*model).clone());
    }

    images
        .iter()
        .find(|model| model.state == "enabled")
        .map(|model| (*model).clone())
        .ok_or_else(|| {
            if images.is_empty() {
                "your account's catalogue publishes no image models".to_string()
            } else {
                format!(
                    "no image model is available in your account right now: {}",
                    images
                        .iter()
                        .map(|model| format!("{} ({})", model.name, model.state))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            }
        })
}

/// A filesystem-safe stem taken from the prompt, so a directory of generations
/// stays readable without the user naming every file.
pub fn prompt_slug(prompt: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in prompt.chars() {
        if character.is_ascii_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            pending_dash = false;
            slug.extend(character.to_lowercase());
            if slug.chars().count() >= SLUG_MAX_CHARS {
                break;
            }
        } else {
            pending_dash = true;
        }
    }
    if slug.is_empty() {
        DEFAULT_STEM.to_string()
    } else {
        slug
    }
}

/// The container the bytes actually are, rather than the one the request asked
/// for: providers return PNG, JPEG or WebP depending on the model.
pub fn image_extension(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "jpg"
    } else if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        "bin"
    }
}

/// Where image `index` of `total` is written.
///
/// Without `--out` the file lands in the working directory under a stem taken
/// from the prompt. With `--out` naming a directory the same stem applies
/// inside it; with `--out` naming a file that name is honoured, and a batch
/// numbers the files after the first so a second image never overwrites the
/// first.
pub fn output_path(
    out: Option<&Path>,
    cwd: &Path,
    prompt: &str,
    index: usize,
    total: usize,
    extension: &str,
) -> PathBuf {
    let numbered = |stem: &str| {
        if total > 1 {
            format!("{stem}-{}", index + 1)
        } else {
            stem.to_string()
        }
    };

    let Some(out) = out else {
        return cwd.join(format!("{}.{extension}", numbered(&prompt_slug(prompt))));
    };

    let out = if out.is_absolute() {
        out.to_path_buf()
    } else {
        cwd.join(out)
    };

    if out.is_dir() {
        return out.join(format!("{}.{extension}", numbered(&prompt_slug(prompt))));
    }

    if total == 1 {
        return out;
    }

    let stem = out
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(DEFAULT_STEM)
        .to_string();
    let suffix = out
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| extension.to_string());
    let parent = out.parent().map(Path::to_path_buf).unwrap_or_default();
    parent.join(format!("{}.{suffix}", numbered(&stem)))
}

/// The admitted image models this deployment can execute.
pub async fn image_models(privacy: PrivacyMode) -> Result<Vec<ImageModelAdmission>, CloudError> {
    let client = CloudClient::connect(privacy)?;
    let availability: MediaAvailability = client.get(MEDIA_AVAILABILITY_PATH, &[]).await?;
    Ok(availability
        .models
        .into_iter()
        .filter(|model| model.kind == "image")
        .collect())
}

/// Generate, download and save. Managed mode only: a Local or BYOK session is
/// refused by the transport before any prompt leaves the machine.
pub async fn generate(
    privacy: PrivacyMode,
    options: &ImageRequestOptions,
    cwd: &Path,
) -> Result<ImageGeneration, CloudError> {
    let client = CloudClient::connect(privacy)?;

    let availability: MediaAvailability = client.get(MEDIA_AVAILABILITY_PATH, &[]).await?;
    let model = choose_image_model(&availability, options.model.as_deref()).map_err(|message| {
        CloudError::Api {
            status: 422,
            message,
        }
    })?;

    let request = ImageGenerationRequest {
        prompt: options.prompt.clone(),
        n: options.count,
        size: options.size.clone(),
        quality: options.quality.clone(),
        model: Some(model.model_id.clone()),
    };

    let response: ImageGenerationResponse = client
        .post_idempotent(
            IMAGE_GENERATE_PATH,
            &idempotency_key(Uuid::new_v4()),
            &request,
            IMAGE_TIMEOUT,
        )
        .await?;

    if !response.success || response.images.is_empty() {
        return Err(CloudError::Api {
            status: 502,
            message: response
                .error
                .unwrap_or_else(|| "image generation returned no image".to_string()),
        });
    }

    let total = response.images.len();
    let mut paths = Vec::with_capacity(total);
    for (index, image) in response.images.iter().enumerate() {
        let bytes = image_bytes(&client, image).await?;
        let path = output_path(
            options.out.as_deref(),
            cwd,
            &options.prompt,
            index,
            total,
            image_extension(&bytes),
        );
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| CloudError::Transport(error.to_string()))?;
            }
        }
        std::fs::write(&path, &bytes).map_err(|error| CloudError::Transport(error.to_string()))?;
        paths.push(path);
    }

    Ok(ImageGeneration {
        paths,
        model: response.model.unwrap_or(model.model_id),
        provider: response.provider.unwrap_or(model.provider),
    })
}

async fn image_bytes(client: &CloudClient, image: &GeneratedImage) -> Result<Vec<u8>, CloudError> {
    if let Some(url) = image.url.as_deref() {
        let path = hosted_media_path(url).ok_or_else(|| {
            CloudError::Decode(format!(
                "the account returned an unreadable image url '{url}'"
            ))
        })?;
        return client.get_bytes(&path).await;
    }
    let encoded = image.b64_json.as_deref().ok_or_else(|| {
        CloudError::Decode("the account returned an image with no data".to_string())
    })?;
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| CloudError::Decode(error.to_string()))
}

/// The account serves generated media from its own origin behind the session
/// credential, so only a same-origin path is fetched with the token attached.
pub fn hosted_media_path(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with("/api/") {
        return Some(trimmed.to_string());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admission(model_id: &str, state: &str) -> ImageModelAdmission {
        ImageModelAdmission {
            model_id: model_id.to_string(),
            name: model_id.to_uppercase(),
            kind: "image".to_string(),
            provider: "openai".to_string(),
            state: state.to_string(),
        }
    }

    #[test]
    fn the_idempotency_key_names_the_cli_surface_and_the_image_operation() {
        let key = idempotency_key(Uuid::nil());
        assert_eq!(
            key,
            "agi.media.cli.image.00000000-0000-0000-0000-000000000000"
        );
        assert!(key.len() <= 128);
    }

    #[test]
    fn the_request_carries_only_the_fields_the_route_accepts() {
        let request = ImageGenerationRequest {
            prompt: "a red bicycle".to_string(),
            n: 1,
            size: Some("256x256".to_string()),
            quality: Some("standard".to_string()),
            model: Some("catalog-image-model".to_string()),
        };
        let encoded = serde_json::to_value(&request).expect("serializable");
        let object = encoded.as_object().expect("an object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, vec!["model", "n", "prompt", "quality", "size"]);
        assert_eq!(object["n"], 1);
        assert_eq!(object["prompt"], "a red bicycle");
    }

    #[test]
    fn an_omitted_model_is_left_out_rather_than_sent_as_null() {
        let request = ImageGenerationRequest {
            prompt: "a red bicycle".to_string(),
            n: 1,
            size: None,
            quality: None,
            model: None,
        };
        let encoded = serde_json::to_value(&request).expect("serializable");
        assert!(encoded.get("model").is_none());
        assert!(
            encoded.get("size").is_none(),
            "an unset size leaves the route's default in force rather than restating it"
        );
        assert!(encoded.get("quality").is_none());
    }

    #[test]
    fn the_first_admitted_image_model_is_the_default() {
        let availability = MediaAvailability {
            models: vec![
                admission("blocked-model", "provider_not_configured"),
                admission("live-model", "enabled"),
                admission("second-live-model", "enabled"),
            ],
        };
        let chosen = choose_image_model(&availability, None).expect("an admitted model");
        assert_eq!(chosen.model_id, "live-model");
    }

    #[test]
    fn a_requested_model_that_is_not_admitted_says_why() {
        let availability = MediaAvailability {
            models: vec![admission("blocked-model", "storage_not_configured")],
        };
        let error = choose_image_model(&availability, Some("blocked-model"))
            .expect_err("an unavailable model must be refused");
        assert!(error.contains("storage_not_configured"), "{error}");
    }

    #[test]
    fn an_unknown_model_is_refused_without_reaching_the_provider() {
        let availability = MediaAvailability {
            models: vec![admission("live-model", "enabled")],
        };
        let error = choose_image_model(&availability, Some("not-in-the-catalogue"))
            .expect_err("an unknown model must be refused");
        assert!(error.contains("not an image model"), "{error}");
    }

    #[test]
    fn no_admitted_image_model_lists_the_states() {
        let availability = MediaAvailability {
            models: vec![admission("blocked-model", "provider_not_configured")],
        };
        let error =
            choose_image_model(&availability, None).expect_err("no model means no generation");
        assert!(error.contains("provider_not_configured"), "{error}");
    }

    #[test]
    fn video_admissions_never_satisfy_an_image_request() {
        let availability = MediaAvailability {
            models: vec![ImageModelAdmission {
                kind: "video".to_string(),
                ..admission("live-video-model", "enabled")
            }],
        };
        assert!(choose_image_model(&availability, None).is_err());
    }

    #[test]
    fn the_prompt_becomes_a_filesystem_safe_stem() {
        assert_eq!(prompt_slug("A Red Bicycle!"), "a-red-bicycle");
        assert_eq!(prompt_slug("  ???  "), "image");
        assert!(prompt_slug(&"long ".repeat(40)).chars().count() <= SLUG_MAX_CHARS);
    }

    #[test]
    fn a_single_image_without_out_lands_in_the_working_directory() {
        let path = output_path(None, Path::new("/work"), "A red bicycle", 0, 1, "png");
        assert_eq!(path, Path::new("/work/a-red-bicycle.png"));
    }

    #[test]
    fn a_batch_numbers_every_file_so_nothing_is_overwritten() {
        let first = output_path(None, Path::new("/work"), "sunset", 0, 2, "png");
        let second = output_path(None, Path::new("/work"), "sunset", 1, 2, "png");
        assert_eq!(first, Path::new("/work/sunset-1.png"));
        assert_eq!(second, Path::new("/work/sunset-2.png"));
        assert_ne!(first, second);
    }

    #[test]
    fn a_relative_out_resolves_against_the_working_directory() {
        let path = output_path(
            Some(Path::new("shots/one.png")),
            Path::new("/work"),
            "sunset",
            0,
            1,
            "png",
        );
        assert_eq!(path, Path::new("/work/shots/one.png"));
    }

    #[test]
    fn an_explicit_out_file_is_honoured_for_a_single_image() {
        let path = output_path(
            Some(Path::new("/tmp/named.webp")),
            Path::new("/work"),
            "sunset",
            0,
            1,
            "png",
        );
        assert_eq!(path, Path::new("/tmp/named.webp"));
    }

    #[test]
    fn an_out_file_keeps_its_extension_when_a_batch_numbers_it() {
        let path = output_path(
            Some(Path::new("/tmp/named.webp")),
            Path::new("/work"),
            "sunset",
            1,
            3,
            "png",
        );
        assert_eq!(path, Path::new("/tmp/named-2.webp"));
    }

    #[test]
    fn the_extension_comes_from_the_bytes_not_from_the_request() {
        assert_eq!(image_extension(&[0x89, b'P', b'N', b'G', 0x0d]), "png");
        assert_eq!(image_extension(&[0xff, 0xd8, 0xff, 0xe0]), "jpg");
        let mut webp = b"RIFF\0\0\0\0WEBPVP8 ".to_vec();
        webp.push(0);
        assert_eq!(image_extension(&webp), "webp");
        assert_eq!(image_extension(b"not an image"), "bin");
    }

    #[test]
    fn only_a_same_origin_account_path_is_fetched_with_the_credential() {
        assert_eq!(
            hosted_media_path("/api/files/1d9c0a2e-0000-4000-8000-000000000000"),
            Some("/api/files/1d9c0a2e-0000-4000-8000-000000000000".to_string())
        );
        assert_eq!(hosted_media_path("https://attacker.example/steal"), None);
        assert_eq!(hosted_media_path("//attacker.example/steal"), None);
    }

    #[tokio::test]
    async fn a_local_session_refuses_to_generate_and_names_the_mode() {
        let options = ImageRequestOptions {
            prompt: "a red bicycle".to_string(),
            count: 1,
            size: Some("256x256".to_string()),
            quality: None,
            model: None,
            out: None,
        };
        let error = generate(PrivacyMode::Local, &options, Path::new("/work"))
            .await
            .expect_err("a local session must never reach managed image generation");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Local)));
        assert!(error.to_string().contains("local"), "{error}");
        assert!(error.is_boundary());
    }

    #[tokio::test]
    async fn a_byok_session_refuses_to_list_image_models() {
        let error = image_models(PrivacyMode::Byok)
            .await
            .expect_err("a byok session must never reach the account catalogue");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Byok)));
    }
}
