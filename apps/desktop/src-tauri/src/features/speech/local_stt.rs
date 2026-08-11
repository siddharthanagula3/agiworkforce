//! Local Speech-to-Text using whisper.cpp via whisper-rs
//!
//! Provides offline transcription capability using runtime-installed
//! whisper.cpp artifacts. Download metadata is embedded from the canonical
//! registry and can be replaced by a validated user manifest.

use super::artifact_registry::{
    safe_artifact_filename, validate_runtime_id, verify_sha256, whisper_descriptors,
};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[cfg(feature = "local-whisper")]
use std::sync::Arc;
#[cfg(feature = "local-whisper")]
use tokio::sync::RwLock;
#[cfg(feature = "local-whisper")]
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Runtime identifier for a locally installed speech model.
///
/// The legacy type name is retained for IPC compatibility. It no longer
/// encodes a fixed family or size enum: adding or replacing a local model only
/// changes the runtime manifest or installed artifact, never this source file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(transparent)]
pub struct WhisperModelSize(String);

impl WhisperModelSize {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for WhisperModelSize {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::str::FromStr for WhisperModelSize {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        validate_runtime_id(s)?;
        Ok(Self(s.to_string()))
    }
}

/// Result of a transcription operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    /// The transcribed text
    pub text: String,
    /// Detected or specified language code (e.g., "en", "es")
    pub language: Option<String>,
    /// Duration of the audio in seconds
    pub duration_seconds: Option<f32>,
    /// Average confidence/probability of the transcription (0.0-1.0)
    pub confidence: Option<f32>,
    /// Individual segments with timing information
    pub segments: Vec<TranscriptionSegment>,
}

/// A segment of transcribed text with timing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    /// Start time in milliseconds
    pub start_ms: i64,
    /// End time in milliseconds
    pub end_ms: i64,
    /// Transcribed text for this segment
    pub text: String,
    /// Confidence score for this segment
    pub confidence: Option<f32>,
}

/// Configuration for transcription
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TranscriptionConfig {
    /// Language hint (ISO 639-1 code like "en", "es", "fr")
    /// If None, Whisper will auto-detect
    pub language: Option<String>,
    /// Whether to translate non-English audio to English
    pub translate_to_english: bool,
    /// Number of threads to use (0 = auto)
    pub num_threads: u32,
    /// Whether to include word-level timestamps
    pub word_timestamps: bool,
    /// Maximum segment length in characters
    pub max_segment_length: Option<u32>,
}

/// Local Whisper-based speech-to-text engine
pub struct WhisperLocal {
    /// Path to the model file
    model_path: PathBuf,
    /// Whisper context (lazy-loaded)
    #[cfg(feature = "local-whisper")]
    context: Arc<RwLock<Option<WhisperContext>>>,
    #[cfg(not(feature = "local-whisper"))]
    _context: std::marker::PhantomData<()>,
}

impl WhisperLocal {
    /// Create a new WhisperLocal instance
    ///
    /// The model is not loaded until the first transcription request.
    pub fn new(model_path: PathBuf) -> Result<Self> {
        if !model_path.exists() {
            return Err(anyhow!(
                "Whisper model not found at {:?}. Please download it first.",
                model_path
            ));
        }

        Ok(Self {
            model_path,
            #[cfg(feature = "local-whisper")]
            context: Arc::new(RwLock::new(None)),
            #[cfg(not(feature = "local-whisper"))]
            _context: std::marker::PhantomData,
        })
    }

    /// Create instance without verifying model exists (for deferred loading)
    pub fn new_deferred(model_path: PathBuf) -> Self {
        Self {
            model_path,
            #[cfg(feature = "local-whisper")]
            context: Arc::new(RwLock::new(None)),
            #[cfg(not(feature = "local-whisper"))]
            _context: std::marker::PhantomData,
        }
    }

    /// Check if the model file exists
    pub fn is_model_available(&self) -> bool {
        self.model_path.exists()
    }

    /// Get the model path
    pub fn model_path(&self) -> &PathBuf {
        &self.model_path
    }

    /// Load the model into memory (if not already loaded)
    #[cfg(feature = "local-whisper")]
    async fn ensure_loaded(&self) -> Result<()> {
        let mut ctx_guard = self.context.write().await;
        if ctx_guard.is_none() {
            tracing::info!("Loading Whisper model from {:?}", self.model_path);

            let params = WhisperContextParameters::default();
            let ctx = WhisperContext::new_with_params(
                self.model_path
                    .to_str()
                    .ok_or_else(|| anyhow!("Invalid model path"))?,
                params,
            )
            .map_err(|e| anyhow!("Failed to load Whisper model: {:?}", e))?;

            *ctx_guard = Some(ctx);
            tracing::info!("Whisper model loaded successfully");
        }
        Ok(())
    }

    #[cfg(not(feature = "local-whisper"))]
    #[allow(dead_code)]
    async fn ensure_loaded(&self) -> Result<()> {
        Err(anyhow!(
            "Local Whisper support not compiled. Enable the 'local-whisper' feature."
        ))
    }

    /// Transcribe audio samples
    ///
    /// # Arguments
    /// * `audio` - Audio samples as f32 PCM, mono channel
    /// * `sample_rate` - Sample rate of the audio (will be resampled to 16kHz if needed)
    /// * `config` - Transcription configuration
    ///
    /// # Returns
    /// Transcription result with text and metadata
    #[cfg(feature = "local-whisper")]
    pub async fn transcribe(
        &self,
        audio: &[f32],
        sample_rate: u32,
        config: Option<TranscriptionConfig>,
    ) -> Result<TranscriptionResult> {
        self.ensure_loaded().await?;

        let config = config.unwrap_or_default();

        // Whisper expects 16kHz audio
        let audio_16k = if sample_rate != 16000 {
            resample_audio(audio, sample_rate, 16000)?
        } else {
            audio.to_vec()
        };

        let ctx_guard = self.context.read().await;
        let ctx = ctx_guard
            .as_ref()
            .ok_or_else(|| anyhow!("Whisper context not loaded"))?;

        // Configure transcription parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Set language if specified
        if let Some(ref lang) = config.language {
            params.set_language(Some(lang));
        }

        // Set translation mode
        params.set_translate(config.translate_to_english);

        // Set threading
        if config.num_threads > 0 {
            params.set_n_threads(config.num_threads as i32);
        }

        // Disable printing progress to stdout
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        // Create a state for this transcription
        let mut state = ctx
            .create_state()
            .map_err(|e| anyhow!("Failed to create Whisper state: {:?}", e))?;

        // Run transcription
        state
            .full(params, &audio_16k)
            .map_err(|e| anyhow!("Transcription failed: {:?}", e))?;

        // Collect results
        let num_segments = state
            .full_n_segments()
            .map_err(|e| anyhow!("Failed to get segment count: {:?}", e))?;

        let mut full_text = String::new();
        let mut segments = Vec::new();
        let mut total_confidence = 0.0f32;
        let mut confidence_count = 0;

        for i in 0..num_segments {
            let text = state
                .full_get_segment_text(i)
                .map_err(|e| anyhow!("Failed to get segment text: {:?}", e))?;

            let start_ms = state
                .full_get_segment_t0(i)
                .map_err(|e| anyhow!("Failed to get segment start: {:?}", e))?
                * 10;
            let end_ms = state
                .full_get_segment_t1(i)
                .map_err(|e| anyhow!("Failed to get segment end: {:?}", e))?
                * 10;

            // Get token probabilities for confidence estimation
            let num_tokens = state
                .full_n_tokens(i)
                .map_err(|e| anyhow!("Failed to get token count: {:?}", e))?;

            let mut segment_confidence = 0.0f32;
            for t in 0..num_tokens {
                if let Ok(prob) = state.full_get_token_prob(i, t) {
                    segment_confidence += prob;
                    total_confidence += prob;
                    confidence_count += 1;
                }
            }
            let avg_segment_confidence = if num_tokens > 0 {
                Some(segment_confidence / num_tokens as f32)
            } else {
                None
            };

            full_text.push_str(&text);

            segments.push(TranscriptionSegment {
                start_ms,
                end_ms,
                text,
                confidence: avg_segment_confidence,
            });
        }

        let avg_confidence = if confidence_count > 0 {
            Some(total_confidence / confidence_count as f32)
        } else {
            None
        };

        let duration = audio_16k.len() as f32 / 16000.0;

        Ok(TranscriptionResult {
            text: full_text.trim().to_string(),
            language: config.language,
            duration_seconds: Some(duration),
            confidence: avg_confidence,
            segments,
        })
    }

    #[cfg(not(feature = "local-whisper"))]
    pub async fn transcribe(
        &self,
        _audio: &[f32],
        _sample_rate: u32,
        _config: Option<TranscriptionConfig>,
    ) -> Result<TranscriptionResult> {
        Err(anyhow!(
            "Local Whisper support not compiled. Enable the 'local-whisper' feature."
        ))
    }

    /// Download a catalog or runtime-configured local speech model.
    ///
    /// Canonical metadata is embedded from the model registry. A user-owned
    /// runtime manifest can override it, but cannot omit checksum validation.
    pub async fn download_model<F>(
        model_id: WhisperModelSize,
        models_dir: PathBuf,
        progress: F,
    ) -> Result<PathBuf>
    where
        F: Fn(u64, u64) + Send + Sync + 'static,
    {
        // Ensure models directory exists
        tokio::fs::create_dir_all(&models_dir)
            .await
            .context("Failed to create models directory")?;

        let descriptor = whisper_descriptors(&models_dir)?
            .into_iter()
            .find(|entry| entry.id == model_id.as_str())
            .ok_or_else(|| {
                anyhow!(
                    "Local speech model '{}' is not present in the runtime manifest",
                    model_id
                )
            })?;
        let filename = safe_artifact_filename(&descriptor.filename)?;
        let model_path = models_dir.join(filename);

        // Check if already downloaded
        if model_path.exists() {
            tracing::info!("Whisper model already exists at {:?}", model_path);
            return Ok(model_path);
        }

        let url = descriptor.download_url.as_deref().ok_or_else(|| {
            anyhow!(
                "Local speech model '{}' has no runtime download URL",
                model_id
            )
        })?;
        let expected_sha256 = descriptor
            .sha256
            .as_deref()
            .ok_or_else(|| anyhow!("Local speech model '{}' has no verified checksum", model_id))?;
        tracing::info!("Downloading local speech model {} from {}", model_id, url);

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .send()
            .await
            .context("Failed to start download")?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Failed to download model: HTTP {}",
                response.status()
            ));
        }

        let total_size = response
            .content_length()
            .unwrap_or(descriptor.approximate_size_bytes);

        // Download to temp file first, then rename (atomic)
        let temp_path = model_path.with_extension("bin.tmp");
        let mut file = tokio::fs::File::create(&temp_path)
            .await
            .context("Failed to create temp file")?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();
        let mut hasher = Sha256::new();

        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Error reading download stream")?;
            file.write_all(&chunk)
                .await
                .context("Failed to write to file")?;
            hasher.update(&chunk);

            downloaded += chunk.len() as u64;
            progress(downloaded, total_size);
        }

        file.flush().await.context("Failed to flush file")?;
        drop(file);

        let digest = hasher.finalize();
        if let Err(error) = verify_sha256(&digest, expected_sha256) {
            let _ = tokio::fs::remove_file(&temp_path).await;
            return Err(error);
        }

        // Rename temp file to final path
        tokio::fs::rename(&temp_path, &model_path)
            .await
            .context("Failed to rename temp file")?;

        tracing::info!("Local speech model downloaded to {:?}", model_path);
        Ok(model_path)
    }

    /// Get the default models directory
    pub fn default_models_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
        Ok(home.join(".agiworkforce").join("models").join("whisper"))
    }

    /// Discover runtime-configured and locally installed speech models.
    pub fn discover_models(models_dir: &Path) -> Result<Vec<WhisperModelInfo>> {
        let mut models = Vec::<WhisperModelInfo>::new();
        let mut known_filenames = HashSet::new();

        for descriptor in whisper_descriptors(models_dir)? {
            let filename = safe_artifact_filename(&descriptor.filename)?;
            known_filenames.insert(filename.to_string());
            let path = models_dir.join(filename);
            let is_downloaded = path.is_file();
            let actual_size = std::fs::metadata(&path)
                .map(|metadata| metadata.len())
                .unwrap_or(descriptor.approximate_size_bytes);
            let description = if descriptor.description.trim().is_empty() {
                "Runtime-configured local speech model".to_string()
            } else {
                descriptor.description
            };
            models.push(WhisperModelInfo {
                size: descriptor.id.parse()?,
                filename: descriptor.filename,
                description,
                approximate_size_mb: actual_size / 1_000_000,
                is_downloaded,
                path: is_downloaded.then_some(path),
            });
        }

        if models_dir.is_dir() {
            let mut entries = std::fs::read_dir(models_dir)
                .context("Failed to inspect local speech model directory")?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                if !path.is_file()
                    || path.extension().and_then(|value| value.to_str()) != Some("bin")
                {
                    continue;
                }
                let filename = match path.file_name().and_then(|value| value.to_str()) {
                    Some(value) => value.to_string(),
                    None => continue,
                };
                if known_filenames.contains(&filename) {
                    continue;
                }
                let id: WhisperModelSize = path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .ok_or_else(|| anyhow!("Local speech model filename is not valid UTF-8"))?
                    .parse()?;
                if models.iter().any(|model| model.size == id) {
                    continue;
                }
                models.push(WhisperModelInfo {
                    size: id,
                    filename,
                    description: "Runtime-discovered local speech model".to_string(),
                    approximate_size_mb: entry
                        .metadata()
                        .map(|metadata| metadata.len() / 1_000_000)
                        .unwrap_or(0),
                    is_downloaded: true,
                    path: Some(path),
                });
            }
        }

        Ok(models)
    }

    /// Resolve an installed model identifier to its discovered artifact.
    pub fn resolve_model_path(models_dir: &Path, model_id: &WhisperModelSize) -> Result<PathBuf> {
        Self::discover_models(models_dir)?
            .into_iter()
            .find(|model| &model.size == model_id && model.is_downloaded)
            .and_then(|model| model.path)
            .ok_or_else(|| anyhow!("Local speech model '{}' is not installed", model_id))
    }

    /// Delete a downloaded model selected by its runtime identifier.
    pub async fn delete_model(models_dir: &Path, model_id: &WhisperModelSize) -> Result<()> {
        if let Ok(path) = Self::resolve_model_path(models_dir, model_id) {
            tokio::fs::remove_file(&path)
                .await
                .context("Failed to delete model file")?;
            tracing::info!("Deleted local speech model {}", model_id);
        }
        Ok(())
    }
}

/// Resample audio from one sample rate to another
#[cfg(feature = "local-whisper")]
fn resample_audio(audio: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    if from_rate == to_rate {
        return Ok(audio.to_vec());
    }

    // Simple linear interpolation resampling
    // For production, consider using a proper resampler like rubato
    let ratio = from_rate as f64 / to_rate as f64;
    let new_len = (audio.len() as f64 / ratio).ceil() as usize;
    let mut resampled = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_idx = i as f64 * ratio;
        let idx_floor = src_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(audio.len() - 1);
        let frac = (src_idx - idx_floor as f64) as f32;

        let sample = audio[idx_floor] * (1.0 - frac) + audio[idx_ceil] * frac;
        resampled.push(sample);
    }

    Ok(resampled)
}

/// Information about available Whisper models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperModelInfo {
    pub size: WhisperModelSize,
    pub filename: String,
    pub description: String,
    pub approximate_size_mb: u64,
    pub is_downloaded: bool,
    pub path: Option<PathBuf>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::speech::artifact_registry::RUNTIME_MANIFEST_FILENAME;

    #[test]
    fn runtime_model_identifier_is_transparent_and_validated() {
        let id = "fixture-local-stt".parse::<WhisperModelSize>().unwrap();
        assert_eq!(id.as_str(), "fixture-local-stt");
        assert!("".parse::<WhisperModelSize>().is_err());
    }

    #[test]
    fn runtime_manifest_and_installed_artifacts_drive_discovery() {
        let clean_dir = tempfile::tempdir().unwrap();
        let canonical_count = WhisperLocal::discover_models(clean_dir.path())
            .unwrap()
            .len();
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": "fixture-catalog-stt",
                    "filename": "fixture-catalog-stt.bin",
                    "description": "Fixture speech model",
                    "approximateSizeBytes": 2_000_000,
                    "downloadUrl": "https://example.invalid/fixture.bin",
                    "sha256": "0".repeat(64)
                }]
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            temp_dir.path().join("fixture-installed-stt.bin"),
            b"fixture",
        )
        .unwrap();

        let models = WhisperLocal::discover_models(temp_dir.path()).unwrap();
        assert_eq!(models.len(), canonical_count + 2);
        assert!(models
            .iter()
            .any(|model| { model.size.as_str() == "fixture-catalog-stt" && !model.is_downloaded }));
        assert!(models.iter().any(|model| {
            model.size.as_str() == "fixture-installed-stt" && model.is_downloaded
        }));
    }

    #[test]
    fn test_default_models_dir() {
        let dir = WhisperLocal::default_models_dir();
        assert!(dir.is_ok());
        let path = dir.unwrap();
        assert!(path.ends_with("whisper"));
    }

    #[test]
    fn manifest_rejects_path_traversal() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "models": [{
                    "id": "fixture-escape-stt",
                    "filename": "../fixture.bin",
                    "downloadUrl": "https://example.invalid/fixture.bin",
                    "sha256": "0".repeat(64)
                }]
            })
            .to_string(),
        )
        .unwrap();
        assert!(WhisperLocal::discover_models(temp_dir.path()).is_err());
    }

    #[test]
    fn clean_install_exposes_canonical_downloads() {
        let temp_dir = tempfile::tempdir().unwrap();
        let descriptors = whisper_descriptors(temp_dir.path()).unwrap();
        let models = WhisperLocal::discover_models(temp_dir.path()).unwrap();
        assert_eq!(models.len(), descriptors.len());
        assert!(models.iter().all(|model| !model.is_downloaded));
        assert!(descriptors
            .iter()
            .all(|entry| entry.download_url.is_some() && entry.sha256.is_some()));
    }

    #[test]
    fn canonical_download_is_marked_installed_without_a_duplicate_discovery_id() {
        let temp_dir = tempfile::tempdir().unwrap();
        let descriptors = whisper_descriptors(temp_dir.path()).unwrap();
        let selected = &descriptors[0];
        std::fs::write(temp_dir.path().join(&selected.filename), b"fixture").unwrap();

        let models = WhisperLocal::discover_models(temp_dir.path()).unwrap();
        assert_eq!(models.len(), descriptors.len());
        assert!(models
            .iter()
            .any(|model| model.size.as_str() == selected.id && model.is_downloaded));
    }
}
