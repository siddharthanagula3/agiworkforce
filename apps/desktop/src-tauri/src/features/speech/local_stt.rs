//! Local Speech-to-Text using whisper.cpp via whisper-rs
//!
//! Provides offline transcription capability using OpenAI's Whisper models
//! compiled as whisper.cpp. This serves as a fallback when cloud services
//! are unavailable or when the user prefers local processing.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[cfg(feature = "local-whisper")]
use std::sync::Arc;
#[cfg(feature = "local-whisper")]
use tokio::sync::RwLock;
#[cfg(feature = "local-whisper")]
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Whisper model size options with tradeoffs between speed and accuracy
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum WhisperModelSize {
    /// ~75MB, fastest, suitable for real-time on most hardware
    Tiny,
    /// ~150MB, good balance of speed and accuracy
    #[default]
    Base,
    /// ~500MB, better accuracy for challenging audio
    Small,
    /// ~1.5GB, highest accuracy, requires more RAM
    Medium,
}

impl WhisperModelSize {
    /// Returns the model filename for Hugging Face download
    pub fn model_filename(&self) -> &'static str {
        match self {
            WhisperModelSize::Tiny => "ggml-tiny.bin",
            WhisperModelSize::Base => "ggml-base.bin",
            WhisperModelSize::Small => "ggml-small.bin",
            WhisperModelSize::Medium => "ggml-medium.bin",
        }
    }

    /// Returns the Hugging Face model URL
    pub fn download_url(&self) -> String {
        format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            self.model_filename()
        )
    }

    /// Approximate file size in bytes for progress estimation
    pub fn approximate_size_bytes(&self) -> u64 {
        match self {
            WhisperModelSize::Tiny => 75_000_000,
            WhisperModelSize::Base => 150_000_000,
            WhisperModelSize::Small => 500_000_000,
            WhisperModelSize::Medium => 1_500_000_000,
        }
    }

    /// Human-readable description
    pub fn description(&self) -> &'static str {
        match self {
            WhisperModelSize::Tiny => "Tiny (~75MB) - Fastest, basic accuracy",
            WhisperModelSize::Base => "Base (~150MB) - Good balance of speed and accuracy",
            WhisperModelSize::Small => "Small (~500MB) - Better accuracy",
            WhisperModelSize::Medium => "Medium (~1.5GB) - Best accuracy, slower",
        }
    }
}

impl std::fmt::Display for WhisperModelSize {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WhisperModelSize::Tiny => write!(f, "tiny"),
            WhisperModelSize::Base => write!(f, "base"),
            WhisperModelSize::Small => write!(f, "small"),
            WhisperModelSize::Medium => write!(f, "medium"),
        }
    }
}

impl std::str::FromStr for WhisperModelSize {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "tiny" => Ok(WhisperModelSize::Tiny),
            "base" => Ok(WhisperModelSize::Base),
            "small" => Ok(WhisperModelSize::Small),
            "medium" => Ok(WhisperModelSize::Medium),
            _ => Err(anyhow!("Unknown Whisper model size: {}", s)),
        }
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
    /// Model size
    model_size: WhisperModelSize,
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
    pub fn new(model_path: PathBuf, model_size: WhisperModelSize) -> Result<Self> {
        if !model_path.exists() {
            return Err(anyhow!(
                "Whisper model not found at {:?}. Please download it first.",
                model_path
            ));
        }

        Ok(Self {
            model_path,
            model_size,
            #[cfg(feature = "local-whisper")]
            context: Arc::new(RwLock::new(None)),
            #[cfg(not(feature = "local-whisper"))]
            _context: std::marker::PhantomData,
        })
    }

    /// Create instance without verifying model exists (for deferred loading)
    pub fn new_deferred(model_path: PathBuf, model_size: WhisperModelSize) -> Self {
        Self {
            model_path,
            model_size,
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

    /// Get the model size
    pub fn model_size(&self) -> WhisperModelSize {
        self.model_size
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

    /// Download a Whisper model to the specified directory
    ///
    /// # Arguments
    /// * `size` - Model size to download
    /// * `models_dir` - Directory to store the model
    /// * `progress` - Progress callback with (bytes_downloaded, total_bytes)
    pub async fn download_model<F>(
        size: WhisperModelSize,
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

        let model_path = models_dir.join(size.model_filename());

        // Check if already downloaded
        if model_path.exists() {
            tracing::info!("Whisper model already exists at {:?}", model_path);
            return Ok(model_path);
        }

        let url = size.download_url();
        tracing::info!("Downloading Whisper {} model from {}", size, url);

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
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
            .unwrap_or(size.approximate_size_bytes());

        // Download to temp file first, then rename (atomic)
        let temp_path = model_path.with_extension("bin.tmp");
        let mut file = tokio::fs::File::create(&temp_path)
            .await
            .context("Failed to create temp file")?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Error reading download stream")?;
            file.write_all(&chunk)
                .await
                .context("Failed to write to file")?;

            downloaded += chunk.len() as u64;
            progress(downloaded, total_size);
        }

        file.flush().await.context("Failed to flush file")?;
        drop(file);

        // Rename temp file to final path
        tokio::fs::rename(&temp_path, &model_path)
            .await
            .context("Failed to rename temp file")?;

        tracing::info!("Whisper model downloaded to {:?}", model_path);
        Ok(model_path)
    }

    /// Get the default models directory
    pub fn default_models_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
        Ok(home.join(".agiworkforce").join("models").join("whisper"))
    }

    /// List available local models
    pub async fn list_available_models(models_dir: &Path) -> Result<Vec<WhisperModelSize>> {
        let mut available = Vec::new();

        for size in [
            WhisperModelSize::Tiny,
            WhisperModelSize::Base,
            WhisperModelSize::Small,
            WhisperModelSize::Medium,
        ] {
            let path = models_dir.join(size.model_filename());
            if path.exists() {
                available.push(size);
            }
        }

        Ok(available)
    }

    /// Delete a downloaded model
    pub async fn delete_model(models_dir: &Path, size: WhisperModelSize) -> Result<()> {
        let path = models_dir.join(size.model_filename());
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .context("Failed to delete model file")?;
            tracing::info!("Deleted Whisper {} model", size);
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

impl WhisperModelInfo {
    pub fn new(size: WhisperModelSize, models_dir: &Path) -> Self {
        let path = models_dir.join(size.model_filename());
        let is_downloaded = path.exists();

        Self {
            size,
            filename: size.model_filename().to_string(),
            description: size.description().to_string(),
            approximate_size_mb: size.approximate_size_bytes() / 1_000_000,
            is_downloaded,
            path: if is_downloaded { Some(path) } else { None },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_size_parsing() {
        assert_eq!(
            "tiny".parse::<WhisperModelSize>().unwrap(),
            WhisperModelSize::Tiny
        );
        assert_eq!(
            "base".parse::<WhisperModelSize>().unwrap(),
            WhisperModelSize::Base
        );
        assert_eq!(
            "small".parse::<WhisperModelSize>().unwrap(),
            WhisperModelSize::Small
        );
        assert_eq!(
            "medium".parse::<WhisperModelSize>().unwrap(),
            WhisperModelSize::Medium
        );
        assert!("invalid".parse::<WhisperModelSize>().is_err());
    }

    #[test]
    fn test_model_urls() {
        assert!(WhisperModelSize::Tiny
            .download_url()
            .contains("ggml-tiny.bin"));
        assert!(WhisperModelSize::Medium
            .download_url()
            .contains("ggml-medium.bin"));
    }

    #[test]
    fn test_default_models_dir() {
        let dir = WhisperLocal::default_models_dir();
        assert!(dir.is_ok());
        let path = dir.unwrap();
        assert!(path.ends_with("whisper"));
    }

    #[tokio::test]
    async fn test_model_info() {
        let temp_dir = std::env::temp_dir().join("whisper_test");
        let info = WhisperModelInfo::new(WhisperModelSize::Tiny, &temp_dir);
        assert_eq!(info.size, WhisperModelSize::Tiny);
        assert!(!info.is_downloaded);
    }
}
