//! Managed Cloud image generation: the same `/api/media/image/generate` route
//! the web composer and the mobile client call.
//!
//! The model is never a literal here. `/api/media/availability` publishes which
//! catalogue image models this deployment can actually execute, and the CLI
//! picks from that admission exactly as the web composer does.

use std::future::Future;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::client::{CloudClient, CloudError, Reply};
use super::image_provenance;
use crate::platform::runtime::session::PrivacyMode;

pub const IMAGE_GENERATE_PATH: &str = "/api/media/image/generate";
pub const IMAGE_CANCEL_PATH: &str = "/api/media/image/cancel";
pub const IMAGE_RETRY_PATH: &str = "/api/media/image/retry";
pub const MEDIA_AVAILABILITY_PATH: &str = "/api/media/availability";
pub const IMAGE_QUALITIES: [&str; 2] = ["standard", "hd"];

/// The route budgets 60s for the provider call and adds its own overhead, so
/// the client waits longer than the shared 20s account timeout.
const IMAGE_TIMEOUT: Duration = Duration::from_secs(150);
const CANCEL_TIMEOUT: Duration = Duration::from_secs(30);
const CANCEL_ATTEMPTS: usize = 5;
const CANCEL_RETRY_DELAY: Duration = Duration::from_secs(1);
const MEMORY_FILE: &str = "image.json";
const UNSUPPORTED_ASPECT_RATIO: &str = "unsupported_aspect_ratio";

const SLUG_MAX_CHARS: usize = 32;
const DEFAULT_STEM: &str = "image";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    pub n: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub transparent_background: bool,
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
    #[serde(default)]
    pub provenance: Vec<Value>,
    #[serde(default)]
    pub job_id: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ImageModelAdmission {
    pub model_id: String,
    pub name: String,
    pub kind: String,
    pub provider: String,
    pub state: String,
    #[serde(default)]
    pub supports_edit: bool,
    #[serde(default)]
    pub aspect_ratios: Vec<String>,
    #[serde(default)]
    pub max_images: Option<u32>,
}

fn unsupported_for_model(model: &ImageModelAdmission, settings: &ImageSettings) -> Option<String> {
    if let Some(ratio) = settings.aspect_ratio.as_deref() {
        if !model.aspect_ratios.is_empty()
            && !model.aspect_ratios.iter().any(|allowed| allowed == ratio)
        {
            return Some(format!(
                "{} does not make {ratio} images. It supports {}.",
                model.name,
                model.aspect_ratios.join(", ")
            ));
        }
    }
    let count = settings.count.unwrap_or(1);
    match model.max_images {
        Some(max) if u32::from(count) > max => Some(format!(
            "{} makes at most {max} image{} per request.",
            model.name,
            if max == 1 { "" } else { "s" }
        )),
        _ => None,
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct MediaAvailability {
    #[serde(default)]
    pub models: Vec<ImageModelAdmission>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImageSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transparent_background: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<u8>,
}

impl ImageSettings {
    pub fn over(&self, base: &ImageSettings) -> ImageSettings {
        let shaped = self.aspect_ratio.is_some() || self.size.is_some();
        let shape = if shaped { self } else { base };
        ImageSettings {
            model: self.model.clone().or_else(|| base.model.clone()),
            aspect_ratio: shape.aspect_ratio.clone(),
            size: shape.size.clone(),
            quality: self.quality.clone().or_else(|| base.quality.clone()),
            transparent_background: self.transparent_background.or(base.transparent_background),
            count: self.count.or(base.count),
        }
    }

    pub fn is_empty(&self) -> bool {
        self == &ImageSettings::default()
    }

    pub fn describe(&self) -> String {
        let mut parts = Vec::new();
        if let Some(model) = &self.model {
            parts.push(format!("model {model}"));
        }
        if let Some(size) = &self.size {
            parts.push(size.clone());
        }
        if let Some(ratio) = &self.aspect_ratio {
            parts.push(format!("{ratio} aspect"));
        }
        if let Some(quality) = &self.quality {
            parts.push(format!("{quality} quality"));
        }
        match self.transparent_background {
            Some(true) => parts.push("transparent background".to_string()),
            Some(false) => parts.push("opaque background".to_string()),
            None => {}
        }
        if let Some(count) = self.count {
            parts.push(format!("{count} per request"));
        }
        if parts.is_empty() {
            "none".to_string()
        } else {
            parts.join(", ")
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ImageCommand {
    pub prompt: Option<String>,
    pub settings: ImageSettings,
    pub out: Option<PathBuf>,
    pub again: bool,
    pub retry: bool,
    pub save_defaults: bool,
    pub clear_defaults: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImageRequestOptions {
    pub prompt: String,
    pub settings: ImageSettings,
    pub out: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SavedImage {
    pub path: PathBuf,
    pub dimensions: Option<(u32, u32)>,
    pub labelled: bool,
}

/// What one `/image` turn produced: the files on disk and the model that drew
/// them.
#[derive(Debug, Clone, PartialEq)]
pub struct ImageGeneration {
    pub prompt: String,
    pub files: Vec<SavedImage>,
    pub model_name: String,
    pub provider: String,
    pub settings: ImageSettings,
    pub note: Option<String>,
}

impl ImageGeneration {
    pub fn paths(&self) -> Vec<PathBuf> {
        self.files.iter().map(|file| file.path.clone()).collect()
    }

    pub fn summary(&self) -> String {
        let dimensions = self.files.first().and_then(|file| file.dimensions);
        let mut text = format!(
            "AI-generated with {} ({}): {}.",
            self.model_name,
            self.provider,
            settings_line(&self.settings, dimensions)
        );
        let unlabelled = self.files.iter().filter(|file| !file.labelled).count();
        if unlabelled == 0 {
            text.push_str(" Labelled as AI-generated in the file metadata.");
        } else {
            text.push_str(&format!(
                " {unlabelled} file(s) could not be labelled as AI-generated: the format is not \
                 one this CLI can write metadata into."
            ));
        }
        if let Some(note) = &self.note {
            text.push(' ');
            text.push_str(note);
        }
        text
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImageFailure {
    pub message: String,
    pub retryable: bool,
    pub job_id: Option<String>,
}

impl ImageFailure {
    fn local(message: String) -> Self {
        Self {
            message,
            retryable: false,
            job_id: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ImageRun {
    Saved(ImageGeneration),
    Stopped(String),
    Failed(ImageFailure),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LastOutcome {
    Started,
    Saved,
    Failed,
    Stopped,
}

impl LastOutcome {
    fn label(self) -> &'static str {
        match self {
            LastOutcome::Started => "did not finish on this device",
            LastOutcome::Saved => "saved",
            LastOutcome::Failed => "failed",
            LastOutcome::Stopped => "stopped",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LastImage {
    #[serde(default)]
    pub owner: String,
    pub prompt: String,
    #[serde(default)]
    pub settings: ImageSettings,
    #[serde(default)]
    pub model_name: String,
    #[serde(default)]
    pub provider: String,
    pub outcome: LastOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    #[serde(default)]
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<PathBuf>,
    #[serde(default)]
    pub at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ImageMemory {
    #[serde(default, skip_serializing_if = "ImageSettings::is_empty")]
    pub defaults: ImageSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last: Option<LastImage>,
}

impl ImageMemory {
    fn path() -> Option<PathBuf> {
        crate::config::CliConfig::config_dir()
            .ok()
            .map(|dir| super::cloud_dir(&dir).join(MEMORY_FILE))
    }

    pub fn load() -> Self {
        Self::path()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn save(&self) -> Result<(), String> {
        let path =
            Self::path().ok_or_else(|| "the CLI config directory is unavailable".to_string())?;
        let serialized = serde_json::to_string_pretty(self).map_err(|error| error.to_string())?;
        write_private(&path, serialized.as_bytes()).map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq)]
struct ModelLabel {
    id: String,
    name: String,
    provider: String,
}

enum CancelTarget<'a> {
    Key(&'a str),
    Job(&'a str),
}

enum CancelOutcome {
    Snapshot {
        accepted: bool,
        snapshot: ImageGenerationResponse,
    },
    NotStarted,
    Unreachable(String),
    Refused(String),
}

pub enum SlashImage {
    Last,
    Command(ImageCommand),
}

pub struct SlashImageOutcome {
    pub text: String,
    pub paths: Vec<PathBuf>,
}

impl SlashImageOutcome {
    fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            paths: Vec::new(),
        }
    }
}

/// Identifies this image operation to the managed-usage ledger. A retry of the
/// same operation settles the same reservation rather than charging twice.
pub fn idempotency_key(operation_id: Uuid) -> String {
    format!("agi.media.cli.image.{operation_id}")
}

pub fn parse_aspect_ratio(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let well_formed = trimmed.split_once(':').is_some_and(|(width, height)| {
        [width, height].iter().all(|part| {
            !part.is_empty()
                && part.len() <= 2
                && !part.starts_with('0')
                && part.bytes().all(|byte| byte.is_ascii_digit())
        })
    });
    if well_formed {
        Ok(trimmed.to_string())
    } else {
        Err(format!(
            "'{value}' is not an aspect ratio. Write it as width:height, for example 16:9."
        ))
    }
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

pub fn choose_model_for(
    availability: &MediaAvailability,
    settings: &ImageSettings,
) -> Result<ImageModelAdmission, String> {
    let transparent = settings.transparent_background == Some(true);
    if settings.model.is_some() || !transparent {
        let model = choose_image_model(availability, settings.model.as_deref())?;
        if transparent && !model.supports_edit {
            return Err(format!(
                "{} cannot make a transparent background. `agi image --list-models` marks the \
                 models that can.",
                model.name
            ));
        }
        return Ok(model);
    }
    availability
        .models
        .iter()
        .find(|model| model.kind == "image" && model.state == "enabled" && model.supports_edit)
        .cloned()
        .ok_or_else(|| {
            "no image model available to your account can make a transparent background right now"
                .to_string()
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

fn names_a_file(out: Option<&Path>, cwd: &Path) -> bool {
    out.is_some_and(|out| !cwd.join(out).is_dir())
}

fn unused_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(DEFAULT_STEM)
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_string);
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    (2u32..)
        .map(|number| match &extension {
            Some(extension) => parent.join(format!("{stem}-{number}.{extension}")),
            None => parent.join(format!("{stem}-{number}")),
        })
        .find(|candidate| !candidate.exists())
        .unwrap_or(path)
}

fn reduced_ratio(width: u32, height: u32) -> String {
    let (mut a, mut b) = (width, height);
    while b != 0 {
        (a, b) = (b, a % b);
    }
    let divisor = a.max(1);
    format!("{}:{}", width / divisor, height / divisor)
}

fn settings_line(settings: &ImageSettings, dimensions: Option<(u32, u32)>) -> String {
    let mut parts = Vec::new();
    match (dimensions, settings.size.as_deref()) {
        (Some((width, height)), _) => parts.push(format!("{width}x{height}")),
        (None, Some(size)) => parts.push(size.to_string()),
        (None, None) => {}
    }
    if let Some(ratio) = settings
        .aspect_ratio
        .clone()
        .or_else(|| dimensions.map(|(width, height)| reduced_ratio(width, height)))
    {
        parts.push(format!("{ratio} aspect"));
    }
    parts.push(match settings.quality.as_deref() {
        Some(quality) => format!("{quality} quality"),
        None => "default quality".to_string(),
    });
    if settings.transparent_background == Some(true) {
        parts.push("transparent background".to_string());
    }
    let count = settings.count.unwrap_or(1);
    if count > 1 {
        parts.push(format!("{count} images"));
    }
    parts.join(", ")
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("json.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    {
        use std::io::Write;
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
    }
    std::fs::rename(&temp, path)
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn remember(last: &LastImage) {
    if !crate::cli_options::session_persistence_enabled() {
        return;
    }
    let mut memory = ImageMemory::load();
    memory.last = Some(last.clone());
    if let Err(error) = memory.save() {
        tracing::warn!("could not record the last image request: {error}");
    }
}

pub fn save_defaults(settings: &ImageSettings) -> Result<String, String> {
    if settings.is_empty() {
        return Err(
            "Nothing to save: add the settings to remember, such as --aspect 16:9 or --quality hd."
                .to_string(),
        );
    }
    let mut memory = ImageMemory::load();
    memory.defaults = settings.over(&memory.defaults);
    memory
        .save()
        .map_err(|error| format!("Could not save your image defaults: {error}"))?;
    Ok(format!(
        "Saved image defaults: {}. Later images use them unless you pass a different setting.",
        memory.defaults.describe()
    ))
}

pub fn clear_defaults() -> Result<String, String> {
    let mut memory = ImageMemory::load();
    memory.defaults = ImageSettings::default();
    memory
        .save()
        .map_err(|error| format!("Could not clear your image defaults: {error}"))?;
    Ok("Cleared your saved image defaults.".to_string())
}

pub fn describe_last() -> String {
    let memory = ImageMemory::load();
    let defaults = memory.defaults.describe();
    let Some(last) = memory.last else {
        return format!("No image on this device yet. Saved defaults: {defaults}.");
    };
    let when = chrono::DateTime::parse_from_rfc3339(&last.at)
        .map(|at| {
            at.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| last.at.clone());
    let mut lines = vec![
        format!("Last image: {}, {when}", last.outcome.label()),
        format!("Prompt: {}", last.prompt),
    ];
    if !last.model_name.is_empty() {
        lines.push(format!("Model: {} ({})", last.model_name, last.provider));
    }
    lines.push(format!("Settings: {}", last.settings.describe()));
    if !last.files.is_empty() {
        lines.push(format!(
            "Files: {}",
            last.files
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    lines.push(format!("Saved defaults: {defaults}"));
    lines.join("\n")
}

pub fn prepare(command: &ImageCommand) -> Result<ImageRequestOptions, String> {
    let memory = ImageMemory::load();
    let prompt = command
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty())
        .map(str::to_string);
    if command.again {
        let Some(last) = memory.last else {
            return Err("There is no earlier image on this device to reuse yet.".to_string());
        };
        return Ok(ImageRequestOptions {
            prompt: prompt.unwrap_or(last.prompt),
            settings: command.settings.over(&last.settings),
            out: command.out.clone(),
        });
    }
    let prompt = prompt.ok_or_else(|| "An image needs a prompt.".to_string())?;
    Ok(ImageRequestOptions {
        prompt,
        settings: command.settings.over(&memory.defaults),
        out: command.out.clone(),
    })
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
    stop: impl Future<Output = ()>,
) -> Result<ImageRun, CloudError> {
    let client = CloudClient::connect(privacy)?;
    generate_with(&client, options, cwd, stop).await
}

async fn generate_with(
    client: &CloudClient,
    options: &ImageRequestOptions,
    cwd: &Path,
    stop: impl Future<Output = ()>,
) -> Result<ImageRun, CloudError> {
    let availability: MediaAvailability = client.get(MEDIA_AVAILABILITY_PATH, &[]).await?;
    let model = match choose_model_for(&availability, &options.settings) {
        Ok(model) => model,
        Err(message) => return Ok(ImageRun::Failed(ImageFailure::local(message))),
    };
    if let Some(message) = unsupported_for_model(&model, &options.settings) {
        return Ok(ImageRun::Failed(ImageFailure::local(message)));
    }
    let settings = ImageSettings {
        model: Some(model.model_id.clone()),
        ..options.settings.clone()
    };
    let request = ImageGenerationRequest {
        prompt: options.prompt.clone(),
        n: settings.count.unwrap_or(1),
        size: settings.size.clone(),
        aspect_ratio: settings.aspect_ratio.clone(),
        quality: settings.quality.clone(),
        model: settings.model.clone(),
        transparent_background: settings.transparent_background.unwrap_or(false),
    };
    let label = ModelLabel {
        id: model.model_id.clone(),
        name: model.name.clone(),
        provider: model.provider.clone(),
    };
    let options = ImageRequestOptions {
        settings,
        ..options.clone()
    };
    let key = idempotency_key(Uuid::new_v4());
    let mut last = LastImage {
        owner: client.owner().to_string(),
        prompt: options.prompt.clone(),
        settings: options.settings.clone(),
        model_name: label.name.clone(),
        provider: label.provider.clone(),
        outcome: LastOutcome::Started,
        job_id: None,
        retryable: false,
        files: Vec::new(),
        at: now(),
    };
    remember(&last);

    let posted = client.post_reply(IMAGE_GENERATE_PATH, Some(&key), &request, IMAGE_TIMEOUT);
    tokio::pin!(posted);
    tokio::pin!(stop);
    let reply = tokio::select! {
        reply = &mut posted => reply,
        () = &mut stop => {
            let outcome = cancel(client, CancelTarget::Key(&key)).await;
            return stopped(client, outcome, &options, cwd, &label, &mut last).await;
        }
    };
    settle(client, reply, &options, cwd, &label, &mut last).await
}

pub async fn retry(
    privacy: PrivacyMode,
    out: Option<PathBuf>,
    cwd: &Path,
    stop: impl Future<Output = ()>,
) -> Result<ImageRun, CloudError> {
    let Some(mut last) = ImageMemory::load().last else {
        return Ok(ImageRun::Failed(ImageFailure::local(
            "There is no earlier image on this device to retry yet.".to_string(),
        )));
    };
    let client = CloudClient::connect(privacy)?;
    let options = ImageRequestOptions {
        prompt: last.prompt.clone(),
        settings: last.settings.clone(),
        out,
    };
    let resumable = last.outcome == LastOutcome::Failed
        && last.retryable
        && last.owner == client.owner()
        && last.job_id.is_some();
    let Some(job_id) = last.job_id.clone().filter(|_| resumable) else {
        return generate_with(&client, &options, cwd, stop).await;
    };
    let label = ModelLabel {
        id: last.settings.model.clone().unwrap_or_default(),
        name: last.model_name.clone(),
        provider: last.provider.clone(),
    };
    last.at = now();
    let body = json!({ "job_id": job_id });
    let posted = client.post_reply(IMAGE_RETRY_PATH, None, &body, IMAGE_TIMEOUT);
    tokio::pin!(posted);
    tokio::pin!(stop);
    let reply = tokio::select! {
        reply = &mut posted => reply,
        () = &mut stop => {
            let outcome = cancel(&client, CancelTarget::Job(&job_id)).await;
            return stopped(&client, outcome, &options, cwd, &label, &mut last).await;
        }
    };
    settle(&client, reply, &options, cwd, &label, &mut last).await
}

async fn settle(
    client: &CloudClient,
    reply: Result<Reply, CloudError>,
    options: &ImageRequestOptions,
    cwd: &Path,
    label: &ModelLabel,
    last: &mut LastImage,
) -> Result<ImageRun, CloudError> {
    let reply = match reply {
        Ok(reply) => reply,
        Err(error) => {
            last.outcome = LastOutcome::Failed;
            remember(last);
            return Err(error);
        }
    };
    if !reply.is_success() {
        let failure = failure_from(&reply);
        last.outcome = LastOutcome::Failed;
        last.retryable = failure.retryable;
        if let Some(job_id) = &failure.job_id {
            last.job_id = Some(job_id.clone());
        }
        remember(last);
        return Ok(ImageRun::Failed(failure));
    }
    let response: ImageGenerationResponse =
        serde_json::from_str(&reply.body).map_err(|error| CloudError::Decode(error.to_string()))?;
    if !response.success || response.images.is_empty() {
        last.outcome = LastOutcome::Failed;
        last.retryable = response.retryable;
        if let Some(job_id) = &response.job_id {
            last.job_id = Some(job_id.clone());
        }
        remember(last);
        return Ok(ImageRun::Failed(ImageFailure {
            message: response
                .error
                .unwrap_or_else(|| "image generation returned no image".to_string()),
            retryable: response.retryable,
            job_id: response.job_id,
        }));
    }
    let generation = save_images(client, &response, options, cwd, label, None).await?;
    last.outcome = LastOutcome::Saved;
    last.retryable = false;
    last.job_id = response.job_id.clone();
    last.provider = generation.provider.clone();
    last.files = generation.paths();
    remember(last);
    Ok(ImageRun::Saved(generation))
}

async fn stopped(
    client: &CloudClient,
    outcome: CancelOutcome,
    options: &ImageRequestOptions,
    cwd: &Path,
    label: &ModelLabel,
    last: &mut LastImage,
) -> Result<ImageRun, CloudError> {
    last.outcome = LastOutcome::Stopped;
    last.retryable = false;
    let message = match outcome {
        CancelOutcome::Snapshot { snapshot, .. }
            if snapshot.status.as_deref() == Some("completed") && !snapshot.images.is_empty() =>
        {
            let note = "It finished before the stop reached your account.".to_string();
            let generation =
                save_images(client, &snapshot, options, cwd, label, Some(note)).await?;
            last.outcome = LastOutcome::Saved;
            last.job_id = snapshot.job_id.clone();
            last.provider = generation.provider.clone();
            last.files = generation.paths();
            remember(last);
            return Ok(ImageRun::Saved(generation));
        }
        CancelOutcome::Snapshot {
            accepted: true,
            snapshot,
        } => {
            last.job_id = snapshot.job_id;
            "Stopped waiting. The model had already started drawing, so the image will still \
             finish and appear in your account's library."
                .to_string()
        }
        CancelOutcome::Snapshot { snapshot, .. } => {
            last.job_id = snapshot.job_id;
            "Stopped this image.".to_string()
        }
        CancelOutcome::NotStarted => "Stopped this image.".to_string(),
        CancelOutcome::Unreachable(reason) => format!(
            "Stopped waiting, but the stop did not reach your account ({reason}). The image may \
             still finish and appear in your account's library."
        ),
        CancelOutcome::Refused(reason) => format!(
            "Stopped waiting, but your account did not accept the stop: {reason} The image may \
             still finish and appear in your account's library."
        ),
    };
    remember(last);
    Ok(ImageRun::Stopped(message))
}

async fn cancel(client: &CloudClient, target: CancelTarget<'_>) -> CancelOutcome {
    let body = match target {
        CancelTarget::Key(key) => json!({ "idempotency_key": key }),
        CancelTarget::Job(job_id) => json!({ "job_id": job_id }),
    };
    let mut unreachable = None;
    for attempt in 0..CANCEL_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(CANCEL_RETRY_DELAY).await;
        }
        match client
            .post_reply(IMAGE_CANCEL_PATH, None, &body, CANCEL_TIMEOUT)
            .await
        {
            Ok(reply) if reply.status == 404 => unreachable = None,
            Ok(reply) if reply.is_success() => {
                return match serde_json::from_str(&reply.body) {
                    Ok(snapshot) => CancelOutcome::Snapshot {
                        accepted: reply.status == 202,
                        snapshot,
                    },
                    Err(error) => CancelOutcome::Unreachable(error.to_string()),
                };
            }
            Ok(reply) => return CancelOutcome::Refused(failure_from(&reply).message),
            Err(error) if error.is_boundary() => return CancelOutcome::Refused(error.to_string()),
            Err(error) => unreachable = Some(error.to_string()),
        }
    }
    match unreachable {
        Some(reason) => CancelOutcome::Unreachable(reason),
        None => CancelOutcome::NotStarted,
    }
}

fn failure_from(reply: &Reply) -> ImageFailure {
    let body: Value = serde_json::from_str(&reply.body).unwrap_or(Value::Null);
    let envelope = body.get("error");
    let text = |value: Option<&Value>| value.and_then(Value::as_str).map(str::to_string);
    let mut message = text(envelope)
        .or_else(|| text(envelope.and_then(|error| error.get("message"))))
        .or_else(|| text(body.get("message")))
        .unwrap_or_else(|| format!("image generation failed (HTTP {})", reply.status));
    let code = text(envelope.and_then(|error| error.get("code")));
    let supported: Vec<String> = envelope
        .and_then(|error| error.get("supported_aspect_ratios"))
        .and_then(Value::as_array)
        .map(|ratios| {
            ratios
                .iter()
                .filter_map(|ratio| ratio.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    if code.as_deref() == Some(UNSUPPORTED_ASPECT_RATIO) && !supported.is_empty() {
        message = format!("{message} It supports {}.", supported.join(", "));
    }
    ImageFailure {
        message,
        retryable: body
            .get("retryable")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        job_id: text(body.get("job_id")),
    }
}

async fn save_images(
    client: &CloudClient,
    response: &ImageGenerationResponse,
    options: &ImageRequestOptions,
    cwd: &Path,
    label: &ModelLabel,
    note: Option<String>,
) -> Result<ImageGeneration, CloudError> {
    let provider = response
        .provider
        .clone()
        .unwrap_or_else(|| label.provider.clone());
    let model = response.model.clone().unwrap_or_else(|| label.id.clone());
    let generated_at = now();
    let named = names_a_file(options.out.as_deref(), cwd);
    let total = response.images.len();
    let mut files = Vec::with_capacity(total);
    for (index, image) in response.images.iter().enumerate() {
        let (bytes, header) = image_bytes(client, image).await?;
        let claim = header
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .filter(image_provenance::is_claim)
            .or_else(|| {
                response
                    .provenance
                    .get(index)
                    .filter(|claim| image_provenance::is_claim(claim))
                    .cloned()
            })
            .unwrap_or_else(|| {
                image_provenance::local_claim(&provider, &model, &bytes, &generated_at)
            });
        let labelled = image_provenance::embed_xmp(&bytes, &image_provenance::xmp_packet(&claim));
        let path = output_path(
            options.out.as_deref(),
            cwd,
            &options.prompt,
            index,
            total,
            image_extension(&bytes),
        );
        let path = if named { path } else { unused_path(path) };
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| CloudError::Transport(error.to_string()))?;
            }
        }
        std::fs::write(&path, labelled.as_deref().unwrap_or(&bytes))
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        files.push(SavedImage {
            path,
            dimensions: image_provenance::dimensions(&bytes),
            labelled: labelled.is_some(),
        });
    }

    Ok(ImageGeneration {
        prompt: options.prompt.clone(),
        files,
        model_name: if label.name.is_empty() {
            label.id.clone()
        } else {
            label.name.clone()
        },
        provider,
        settings: options.settings.clone(),
        note,
    })
}

async fn image_bytes(
    client: &CloudClient,
    image: &GeneratedImage,
) -> Result<(Vec<u8>, Option<String>), CloudError> {
    if let Some(url) = image.url.as_deref() {
        let path = hosted_media_path(url).ok_or_else(|| {
            CloudError::Decode(format!(
                "the account returned an unreadable image url '{url}'"
            ))
        })?;
        return client
            .get_bytes_with_header(&path, Some(image_provenance::PROVENANCE_HEADER))
            .await;
    }
    let encoded = image.b64_json.as_deref().ok_or_else(|| {
        CloudError::Decode("the account returned an image with no data".to_string())
    })?;
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map(|bytes| (bytes, None))
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

pub fn slash_generates(arg: &str) -> bool {
    matches!(
        parse_slash(arg),
        Ok(SlashImage::Command(command))
            if command.retry || command.again || command.prompt.is_some()
    )
}

pub fn parse_slash(arg: &str) -> Result<SlashImage, String> {
    match arg.trim() {
        "last" => return Ok(SlashImage::Last),
        "again" => {
            return Ok(SlashImage::Command(ImageCommand {
                again: true,
                ..ImageCommand::default()
            }))
        }
        "retry" => {
            return Ok(SlashImage::Command(ImageCommand {
                retry: true,
                ..ImageCommand::default()
            }))
        }
        _ => {}
    }
    let mut command = ImageCommand::default();
    let mut rest = arg.trim_start();
    loop {
        let (token, after) = next_token(rest);
        let is_option = token.starts_with("--") || token == "-n" || token == "-m";
        if !is_option {
            break;
        }
        rest = after;
        if token == "--" {
            break;
        }
        let (name, inline) = match token.split_once('=') {
            Some((name, value)) => (name, Some(value.to_string())),
            None => (token, None),
        };
        let mut value = || -> Result<String, String> {
            if let Some(value) = inline.clone() {
                return Ok(value);
            }
            let (value, after) = next_token(rest);
            if value.is_empty() {
                return Err(format!("{name} needs a value."));
            }
            rest = after;
            Ok(value.to_string())
        };
        match name {
            "--aspect" => command.settings.aspect_ratio = Some(parse_aspect_ratio(&value()?)?),
            "--size" => command.settings.size = Some(value()?),
            "--quality" => {
                let quality = value()?;
                if !IMAGE_QUALITIES.contains(&quality.as_str()) {
                    return Err(format!(
                        "--quality takes {}, not '{quality}'.",
                        IMAGE_QUALITIES.join(" or ")
                    ));
                }
                command.settings.quality = Some(quality);
            }
            "--model" | "-m" => command.settings.model = Some(value()?),
            "--count" | "-n" => {
                let count = value()?;
                command.settings.count = Some(
                    count
                        .parse::<u8>()
                        .map_err(|_| format!("-n takes a number of images, not '{count}'."))?,
                );
            }
            "--transparent" => {
                command.settings.transparent_background = Some(match inline.as_deref() {
                    None | Some("true") => true,
                    Some("false") => false,
                    Some(other) => {
                        return Err(format!("--transparent takes true or false, not '{other}'."))
                    }
                })
            }
            "--again" => command.again = true,
            "--save-defaults" => command.save_defaults = true,
            "--clear-defaults" => command.clear_defaults = true,
            other => {
                return Err(format!(
                    "Unknown /image option {other}. Options: --aspect, --size, --quality, \
                     --transparent, --model, -n, --again, --save-defaults, --clear-defaults."
                ))
            }
        }
    }
    command.prompt = Some(rest.trim())
        .filter(|prompt| !prompt.is_empty())
        .map(str::to_string);
    Ok(SlashImage::Command(command))
}

fn next_token(text: &str) -> (&str, &str) {
    let text = text.trim_start();
    match text.find(char::is_whitespace) {
        Some(end) => (&text[..end], text[end..].trim_start()),
        None => (text, ""),
    }
}

pub async fn run_slash(
    privacy: PrivacyMode,
    arg: &str,
    cwd: &Path,
    stop: impl Future<Output = ()>,
) -> SlashImageOutcome {
    let command = match parse_slash(arg) {
        Ok(SlashImage::Last) => return SlashImageOutcome::text(describe_last()),
        Ok(SlashImage::Command(command)) => command,
        Err(message) => return SlashImageOutcome::text(message),
    };
    let mut notes = Vec::new();
    if command.clear_defaults {
        match clear_defaults() {
            Ok(note) => notes.push(note),
            Err(message) => return SlashImageOutcome::text(message),
        }
    }
    if command.save_defaults {
        match save_defaults(&command.settings) {
            Ok(note) => notes.push(note),
            Err(message) => return SlashImageOutcome::text(message),
        }
    }
    let run = if command.retry {
        retry(privacy, None, cwd, stop).await
    } else if command.prompt.is_none() && !command.again {
        return SlashImageOutcome::text(if notes.is_empty() {
            "Add a prompt: /image a red bicycle".to_string()
        } else {
            notes.join(" ")
        });
    } else {
        match prepare(&command) {
            Ok(options) => generate(privacy, &options, cwd, stop).await,
            Err(message) => return SlashImageOutcome::text(message),
        }
    };
    let reused = command.again || command.retry;
    match run {
        Ok(ImageRun::Saved(generation)) => {
            let mut text = notes;
            if reused {
                text.push(format!("Prompt: {}.", generation.prompt));
            }
            text.push(format!(
                "Saved {}. {}",
                generation
                    .files
                    .iter()
                    .map(|file| file.path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                generation.summary()
            ));
            SlashImageOutcome {
                text: text.join(" "),
                paths: generation.paths(),
            }
        }
        Ok(ImageRun::Stopped(message)) => SlashImageOutcome::text(message),
        Ok(ImageRun::Failed(failure)) => SlashImageOutcome::text(format!(
            "Image generation failed: {}{}",
            failure.message,
            if failure.retryable {
                " Type /image retry to try it again."
            } else {
                ""
            }
        )),
        Err(error) => SlashImageOutcome::text(format!("Image generation failed: {error}")),
    }
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
            supports_edit: false,
            aspect_ratios: Vec::new(),
            max_images: None,
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
            aspect_ratio: None,
            quality: Some("standard".to_string()),
            model: Some("catalog-image-model".to_string()),
            transparent_background: false,
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
            aspect_ratio: None,
            quality: None,
            model: None,
            transparent_background: false,
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
            settings: ImageSettings {
                size: Some("256x256".to_string()),
                ..ImageSettings::default()
            },
            out: None,
        };
        let error = generate(
            PrivacyMode::Local,
            &options,
            Path::new("/work"),
            std::future::pending(),
        )
        .await
        .expect_err("a local session must never reach managed image generation");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Local)));
        assert!(error.to_string().starts_with("Local:"), "{error}");
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
