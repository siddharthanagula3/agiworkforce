//! Local Text-to-Speech using Piper
//!
//! Provides offline TTS capability using Piper, a fast neural TTS engine.
//! This serves as a fallback when cloud services are unavailable or when
//! the user prefers local processing for privacy.

use super::artifact_registry::{
    piper_binary_descriptor, piper_voice_descriptors, safe_artifact_filename, validate_runtime_id,
    verify_sha256, PiperVoiceDescriptor,
};
use super::piper_bundle::{
    extract_archive, promote_bundle, validate_bundle_layout, versioned_bundle_paths,
};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// Quality level for Piper voices
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum PiperQuality {
    /// Lowest quality, smallest size, fastest
    Low,
    /// Medium quality, balanced
    #[default]
    Medium,
    /// Highest quality, largest size
    High,
}

impl std::fmt::Display for PiperQuality {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PiperQuality::Low => write!(f, "low"),
            PiperQuality::Medium => write!(f, "medium"),
            PiperQuality::High => write!(f, "high"),
        }
    }
}

/// Information about an available Piper voice
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceInfo {
    /// Runtime-provided unique voice identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Language code (e.g., "en_US")
    pub language: String,
    /// Quality level
    pub quality: PiperQuality,
    /// Whether this voice is downloaded locally
    pub is_downloaded: bool,
    /// Path to the model file if downloaded
    pub model_path: Option<PathBuf>,
    /// Sample rate of the voice
    pub sample_rate: u32,
    /// Approximate model size in MB
    pub size_mb: u64,
    /// Description or notes about the voice
    pub description: Option<String>,
}

/// Configuration for TTS synthesis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthesisConfig {
    /// Speaking rate multiplier (0.5 = half speed, 2.0 = double speed)
    pub rate: f32,
    /// Volume multiplier (0.0 to 1.0)
    pub volume: f32,
    /// Pitch adjustment in semitones (-12 to +12)
    pub pitch_semitones: f32,
    /// Whether to output raw PCM or WAV.
    /// NOTE: Currently unused — `--output_raw` is always passed to Piper unconditionally.
    /// Retained for API compatibility; always set to `true`.
    pub output_raw: bool,
}

impl Default for SynthesisConfig {
    fn default() -> Self {
        Self {
            rate: 1.0,
            volume: 1.0,
            pitch_semitones: 0.0,
            output_raw: true,
        }
    }
}

/// Result of TTS synthesis
#[derive(Debug, Clone)]
pub struct SynthesisResult {
    /// Audio samples as f32 PCM
    pub samples: Vec<f32>,
    /// Sample rate of the audio
    pub sample_rate: u32,
    /// Number of audio channels (always 1 for Piper)
    pub channels: u8,
    /// Duration in seconds
    pub duration_seconds: f32,
}

/// Runtime Piper voice definitions.
///
/// The legacy public name is retained for IPC compatibility. Voice identities
/// come from the embedded registry, optional user overrides, or installed
/// artifacts discovered on disk.
pub struct PiperVoiceDefinitions;

impl PiperVoiceDefinitions {
    pub fn discover(models_dir: &Path) -> Result<Vec<VoiceInfo>> {
        let mut voices = Vec::<VoiceInfo>::new();
        let mut known_filenames = HashSet::new();

        for descriptor in piper_voice_descriptors(models_dir)? {
            let model_filename = safe_artifact_filename(&descriptor.model_filename)?;
            known_filenames.insert(model_filename.to_string());
            let config_filename = safe_artifact_filename(&descriptor.config_filename)?;
            let model_path = models_dir.join(model_filename);
            let config_path = models_dir.join(config_filename);
            let installed_sample_rate = read_runtime_voice_metadata(&config_path)
                .sample_rate
                .filter(|sample_rate| *sample_rate > 0);
            let is_downloaded = model_path.is_file() && installed_sample_rate.is_some();
            let actual_size = std::fs::metadata(&model_path)
                .map(|metadata| metadata.len())
                .unwrap_or(descriptor.size_bytes);
            voices.push(VoiceInfo {
                id: descriptor.id.clone(),
                name: nonempty_or(&descriptor.name, &descriptor.id),
                language: nonempty_or(&descriptor.language, "unknown"),
                quality: parse_quality(&descriptor.quality)?,
                is_downloaded,
                model_path: is_downloaded.then_some(model_path),
                sample_rate: installed_sample_rate.unwrap_or(descriptor.sample_rate),
                size_mb: actual_size / 1_000_000,
                description: descriptor.description,
            });
        }

        if models_dir.is_dir() {
            let mut entries = std::fs::read_dir(models_dir)
                .context("Failed to inspect local voice directory")?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let path = entry.path();
                if !path.is_file()
                    || path.extension().and_then(|value| value.to_str()) != Some("onnx")
                {
                    continue;
                }
                let id = match path.file_stem().and_then(|value| value.to_str()) {
                    Some(value) => value.to_string(),
                    None => continue,
                };
                let filename = match path.file_name().and_then(|value| value.to_str()) {
                    Some(value) => value.to_string(),
                    None => continue,
                };
                if known_filenames.contains(&filename) {
                    continue;
                }
                validate_runtime_id(&id)?;
                if voices.iter().any(|voice| voice.id == id) {
                    continue;
                }
                let config_path = path.with_extension("onnx.json");
                if !config_path.is_file() {
                    continue;
                }
                let metadata = read_runtime_voice_metadata(&config_path);
                let Some(sample_rate) = metadata.sample_rate.filter(|sample_rate| *sample_rate > 0)
                else {
                    continue;
                };
                voices.push(VoiceInfo {
                    id: id.clone(),
                    name: metadata.name.unwrap_or_else(|| id.replace(['-', '_'], " ")),
                    language: metadata.language.unwrap_or_else(|| "unknown".to_string()),
                    quality: metadata.quality.unwrap_or_default(),
                    is_downloaded: true,
                    model_path: Some(path),
                    sample_rate,
                    size_mb: entry
                        .metadata()
                        .map(|value| value.len() / 1_000_000)
                        .unwrap_or(0),
                    description: metadata.description,
                });
            }
        }

        Ok(voices)
    }

    fn descriptor(models_dir: &Path, voice_id: &str) -> Result<PiperVoiceDescriptor> {
        piper_voice_descriptors(models_dir)?
            .into_iter()
            .find(|entry| entry.id == voice_id)
            .ok_or_else(|| {
                anyhow!(
                    "Local voice '{}' is not present in the runtime manifest",
                    voice_id
                )
            })
    }

    fn artifact_paths(models_dir: &Path, voice_id: &str) -> Result<(PathBuf, PathBuf)> {
        if let Ok(descriptor) = Self::descriptor(models_dir, voice_id) {
            return Ok((
                models_dir.join(safe_artifact_filename(&descriptor.model_filename)?),
                models_dir.join(safe_artifact_filename(&descriptor.config_filename)?),
            ));
        }
        let model_path = Self::discover(models_dir)?
            .into_iter()
            .find(|voice| voice.id == voice_id && voice.is_downloaded)
            .and_then(|voice| voice.model_path)
            .ok_or_else(|| anyhow!("Local voice '{}' is not installed", voice_id))?;
        let config_path = model_path.with_extension("onnx.json");
        Ok((model_path, config_path))
    }
}

#[derive(Default)]
struct RuntimeVoiceMetadata {
    name: Option<String>,
    language: Option<String>,
    quality: Option<PiperQuality>,
    sample_rate: Option<u32>,
    description: Option<String>,
}

fn read_runtime_voice_metadata(config_path: &Path) -> RuntimeVoiceMetadata {
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return RuntimeVoiceMetadata::default();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return RuntimeVoiceMetadata::default();
    };
    let quality = value
        .get("quality")
        .and_then(|entry| entry.as_str())
        .and_then(|entry| match entry {
            "low" => Some(PiperQuality::Low),
            "medium" => Some(PiperQuality::Medium),
            "high" => Some(PiperQuality::High),
            _ => None,
        });
    RuntimeVoiceMetadata {
        name: value
            .get("name")
            .and_then(|entry| entry.as_str())
            .map(str::to_string),
        language: value
            .pointer("/language/code")
            .or_else(|| value.get("language"))
            .and_then(|entry| entry.as_str())
            .map(str::to_string),
        quality,
        sample_rate: value
            .pointer("/audio/sample_rate")
            .and_then(|entry| entry.as_u64())
            .map(|entry| entry as u32),
        description: value
            .get("description")
            .and_then(|entry| entry.as_str())
            .map(str::to_string),
    }
}

fn nonempty_or(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn parse_quality(value: &str) -> Result<PiperQuality> {
    match value {
        "" | "medium" => Ok(PiperQuality::Medium),
        "low" => Ok(PiperQuality::Low),
        "high" => Ok(PiperQuality::High),
        _ => Err(anyhow!("Invalid local voice quality")),
    }
}

/// Local Piper-based text-to-speech engine
pub struct PiperLocal {
    /// Path to the Piper executable
    piper_path: PathBuf,
    /// Directory containing voice models
    models_dir: PathBuf,
    /// Currently selected voice
    voice_id: String,
    /// Voice model path
    model_path: PathBuf,
    /// Voice sample rate
    sample_rate: u32,
}

impl PiperLocal {
    /// Create a new PiperLocal instance
    ///
    /// # Arguments
    /// * `models_dir` - Directory containing Piper voice models
    /// * `voice_id` - Runtime-discovered voice identifier to use
    pub fn new(models_dir: PathBuf, voice_id: &str) -> Result<Self> {
        validate_runtime_id(voice_id)?;
        let piper_path = Self::find_piper_binary()?;
        let (model_path, config_path) =
            PiperVoiceDefinitions::artifact_paths(&models_dir, voice_id)?;

        if !model_path.exists() {
            return Err(anyhow!(
                "Piper voice model not found at {:?}. Please download it first.",
                model_path
            ));
        }

        // Try to read sample rate from config
        let sample_rate = Self::read_sample_rate(&config_path)
            .context("Local voice config must declare an audio sample rate")?;
        if sample_rate == 0 {
            return Err(anyhow!("Local voice sample rate must be greater than zero"));
        }

        Ok(Self {
            piper_path,
            models_dir,
            voice_id: voice_id.to_string(),
            model_path,
            sample_rate,
        })
    }

    /// Find the Piper binary on the system
    fn find_piper_binary() -> Result<PathBuf> {
        if let Ok(bin_dir) = Self::default_bin_dir() {
            if let Some(path) = Self::managed_piper_binary(&bin_dir)? {
                return Ok(path);
            }
        }

        #[cfg(windows)]
        {
            // On Windows the binary is piper.exe
            if let Some(home) = dirs::home_dir() {
                let app_piper = home.join(".agiworkforce").join("bin").join("piper.exe");
                if app_piper.exists() {
                    return Ok(app_piper);
                }
            }

            // Check LOCALAPPDATA
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                let app_piper = PathBuf::from(local_app_data)
                    .join("agiworkforce")
                    .join("bin")
                    .join("piper.exe");
                if app_piper.exists() {
                    return Ok(app_piper);
                }
            }

            // Check if piper.exe is in PATH
            if let Ok(path) = which::which("piper") {
                return Ok(path);
            }

            Err(anyhow!(
                "Piper binary not found. Please download it to %USERPROFILE%\\.agiworkforce\\bin\\piper.exe"
            ))
        }

        #[cfg(not(windows))]
        {
            // Check common Unix locations
            let possible_paths = ["/usr/local/bin/piper", "/usr/bin/piper", "/opt/piper/piper"];

            for path in &possible_paths {
                let p = PathBuf::from(path);
                if p.exists() {
                    return Ok(p);
                }
            }

            // Check home directory
            if let Some(home) = dirs::home_dir() {
                let home_piper = home.join(".local").join("bin").join("piper");
                if home_piper.exists() {
                    return Ok(home_piper);
                }

                let app_piper = home.join(".agiworkforce").join("bin").join("piper");
                if app_piper.exists() {
                    return Ok(app_piper);
                }
            }

            // Check if in PATH
            if let Ok(path) = which::which("piper") {
                return Ok(path);
            }

            Err(anyhow!(
                "Piper binary not found. Please install Piper or download it to ~/.agiworkforce/bin/piper"
            ))
        }
    }

    pub(crate) fn managed_piper_binary(bin_dir: &Path) -> Result<Option<PathBuf>> {
        let descriptor =
            match piper_binary_descriptor(bin_dir, std::env::consts::OS, std::env::consts::ARCH) {
                Ok(descriptor) => descriptor,
                Err(_) => return Ok(None),
            };
        let paths = versioned_bundle_paths(
            bin_dir,
            &descriptor.id,
            &descriptor.sha256,
            &descriptor.executable_path,
        )?;
        if !paths.root.exists() {
            return Ok(None);
        }
        validate_bundle_layout(
            &paths.root,
            &descriptor.executable_path,
            &descriptor.required_files,
            &descriptor.required_directories,
        )
        .map(Some)
    }

    /// Read sample rate from voice config JSON
    fn read_sample_rate(config_path: &PathBuf) -> Result<u32> {
        let content = std::fs::read_to_string(config_path)?;
        let config: serde_json::Value = serde_json::from_str(&content)?;
        config["audio"]["sample_rate"]
            .as_u64()
            .map(|r| r as u32)
            .ok_or_else(|| anyhow!("sample_rate not found in config"))
    }

    /// Check if the voice model is available
    pub fn is_model_available(&self) -> bool {
        self.model_path.exists()
    }

    /// Check if Piper binary is available
    pub fn is_piper_available(&self) -> bool {
        self.piper_path.exists()
    }

    pub(crate) fn binary_available() -> bool {
        Self::find_piper_binary().is_ok()
    }

    /// Get the voice ID
    pub fn voice_id(&self) -> &str {
        &self.voice_id
    }

    /// Get the sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Synthesize text to audio
    ///
    /// # Arguments
    /// * `text` - Text to synthesize
    /// * `config` - Optional synthesis configuration
    ///
    /// # Returns
    /// Audio samples as f32 PCM
    pub async fn synthesize(
        &self,
        text: &str,
        config: Option<SynthesisConfig>,
    ) -> Result<SynthesisResult> {
        if !self.is_model_available() {
            return Err(anyhow!("Voice model not found. Please download it first."));
        }

        if !self.is_piper_available() {
            return Err(anyhow!("Piper binary not found. Please install Piper."));
        }

        let config = config.unwrap_or_default();

        // Build piper command
        let mut cmd = Command::new(&self.piper_path);
        cmd.arg("--model")
            .arg(&self.model_path)
            .arg("--output_raw")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Add rate/pitch if supported by this piper version
        // Note: Not all Piper versions support these flags
        if (config.rate - 1.0).abs() > 0.01 {
            cmd.arg("--length-scale")
                .arg(format!("{:.2}", 1.0 / config.rate));
        }

        tracing::debug!("Running Piper: {:?}", cmd);

        let mut child = cmd.spawn().context("Failed to spawn Piper process")?;

        // Write text to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .await
                .context("Failed to write to Piper stdin")?;
        }

        // Wait for completion and collect output
        let output = child
            .wait_with_output()
            .await
            .context("Failed to wait for Piper")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Piper failed: {}", stderr));
        }

        // Convert raw PCM bytes to f32 samples
        // Piper outputs 16-bit signed PCM
        let raw_bytes = output.stdout;
        let samples: Vec<f32> = raw_bytes
            .chunks_exact(2)
            .map(|chunk| {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                sample as f32 / 32768.0 * config.volume
            })
            .collect();

        let duration = samples.len() as f32 / self.sample_rate as f32;

        Ok(SynthesisResult {
            samples,
            sample_rate: self.sample_rate,
            channels: 1,
            duration_seconds: duration,
        })
    }

    /// List available voices in the models directory
    pub fn list_available_voices(&self) -> Vec<VoiceInfo> {
        PiperVoiceDefinitions::discover(&self.models_dir).unwrap_or_default()
    }

    /// Download a voice model
    ///
    /// # Arguments
    /// * `voice_id` - Voice identifier to download
    /// * `models_dir` - Directory to store the voice
    /// * `progress` - Progress callback (bytes_downloaded, total_bytes)
    pub async fn download_voice<F>(
        voice_id: &str,
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

        validate_runtime_id(voice_id)?;
        let descriptor = PiperVoiceDefinitions::descriptor(&models_dir, voice_id)?;
        let model_path = models_dir.join(safe_artifact_filename(&descriptor.model_filename)?);
        let config_path = models_dir.join(safe_artifact_filename(&descriptor.config_filename)?);

        // Check if already downloaded
        if model_path.exists() && config_path.exists() {
            tracing::info!("Piper voice already exists at {:?}", model_path);
            return Ok(model_path);
        }

        let client = reqwest::Client::new();

        // Install the config first and the model last. Discovery keys off the
        // model file, so an interrupted two-file download never advertises an
        // unusable voice as installed.
        let config_url = descriptor
            .config_url
            .as_deref()
            .ok_or_else(|| anyhow!("Local voice '{}' has no runtime config URL", voice_id))?;
        let config_sha256 = descriptor
            .config_sha256
            .as_deref()
            .ok_or_else(|| anyhow!("Local voice '{}' has no verified config checksum", voice_id))?;
        tracing::info!("Downloading Piper voice config from {}", config_url);

        // Config is small, no progress needed
        Self::download_file(
            &client,
            config_url,
            config_sha256,
            0,
            &config_path,
            |_, _| {},
        )
        .await?;

        let model_url = descriptor
            .model_url
            .as_deref()
            .ok_or_else(|| anyhow!("Local voice '{}' has no runtime model URL", voice_id))?;
        let model_sha256 = descriptor
            .model_sha256
            .as_deref()
            .ok_or_else(|| anyhow!("Local voice '{}' has no verified model checksum", voice_id))?;
        tracing::info!("Downloading Piper voice {} from {}", voice_id, model_url);

        Self::download_file(
            &client,
            model_url,
            model_sha256,
            descriptor.size_bytes,
            &model_path,
            &progress,
        )
        .await?;

        tracing::info!("Piper voice downloaded to {:?}", model_path);
        Ok(model_path)
    }

    /// Helper to download a file with progress
    async fn download_file<F>(
        client: &reqwest::Client,
        url: &str,
        expected_sha256: &str,
        approximate_size_bytes: u64,
        path: &PathBuf,
        progress: F,
    ) -> Result<()>
    where
        F: Fn(u64, u64),
    {
        let response = client
            .get(url)
            .send()
            .await
            .context("Failed to start download")?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to download: HTTP {}", response.status()));
        }

        let total_size = response.content_length().unwrap_or(approximate_size_bytes);

        let temp_path = path.with_extension("tmp");
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
        tokio::fs::rename(&temp_path, path)
            .await
            .context("Failed to rename temp file")?;

        Ok(())
    }

    /// Download Piper binary for the current platform
    pub async fn download_piper<F>(bin_dir: PathBuf, progress: F) -> Result<PathBuf>
    where
        F: Fn(u64, u64) + Send + Sync + 'static,
    {
        tokio::fs::create_dir_all(&bin_dir)
            .await
            .context("Failed to create bin directory")?;

        let descriptor =
            piper_binary_descriptor(&bin_dir, std::env::consts::OS, std::env::consts::ARCH)?;
        if let Some(installed) = Self::managed_piper_binary(&bin_dir)? {
            tracing::info!("Piper bundle already exists at {:?}", installed);
            return Ok(installed);
        }

        let bundle_paths = versioned_bundle_paths(
            &bin_dir,
            &descriptor.id,
            &descriptor.sha256,
            &descriptor.executable_path,
        )?;
        tokio::fs::create_dir_all(&bundle_paths.parent)
            .await
            .context("Failed to create Piper bundle directory")?;
        let working_dir = tempfile::Builder::new()
            .prefix("piper-install-")
            .tempdir_in(&bundle_paths.parent)
            .context("Failed to create Piper installation directory")?;

        tracing::info!("Downloading Piper from {}", descriptor.download_url);

        let client = reqwest::Client::new();
        let temp_archive = working_dir.path().join(format!(
            "{}.download",
            safe_artifact_filename(&descriptor.archive_filename)?
        ));
        Self::download_file(
            &client,
            &descriptor.download_url,
            &descriptor.sha256,
            descriptor.approximate_size_bytes,
            &temp_archive,
            progress,
        )
        .await?;

        tracing::info!("Extracting verified Piper bundle");
        let staging_root = working_dir.path().join("staging");
        let archive_format = descriptor.archive_format.clone();
        let executable_path = descriptor.executable_path.clone();
        let required_files = descriptor.required_files.clone();
        let required_directories = descriptor.required_directories.clone();
        let final_root = bundle_paths.root.clone();
        let executable_relative = bundle_paths.executable_relative.clone();
        let installed = tokio::task::spawn_blocking(move || -> Result<PathBuf> {
            extract_archive(&temp_archive, &archive_format, &staging_root)?;
            validate_bundle_layout(
                &staging_root,
                &executable_path,
                &required_files,
                &required_directories,
            )?;
            match promote_bundle(&staging_root, &final_root, &executable_relative) {
                Ok(path) => Ok(path),
                Err(error) if final_root.exists() => validate_bundle_layout(
                    &final_root,
                    &executable_path,
                    &required_files,
                    &required_directories,
                )
                .with_context(|| format!("{error:#}")),
                Err(error) => Err(error),
            }
        })
        .await
        .context("Piper bundle installation task failed")??;

        tracing::info!("Piper installed to {:?}", installed);
        Ok(installed)
    }

    /// Get the default models directory
    pub fn default_models_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
        Ok(home.join(".agiworkforce").join("models").join("piper"))
    }

    /// Get the default bin directory for Piper executable
    pub fn default_bin_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
        Ok(home.join(".agiworkforce").join("bin"))
    }

    /// Delete a downloaded voice
    pub async fn delete_voice(models_dir: &Path, voice_id: &str) -> Result<()> {
        validate_runtime_id(voice_id)?;
        let (model_path, config_path) =
            PiperVoiceDefinitions::artifact_paths(models_dir, voice_id)?;

        if model_path.exists() {
            tokio::fs::remove_file(&model_path)
                .await
                .context("Failed to delete model file")?;
        }

        if config_path.exists() {
            tokio::fs::remove_file(&config_path)
                .await
                .context("Failed to delete config file")?;
        }

        tracing::info!("Deleted Piper voice: {}", voice_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::speech::artifact_registry::RUNTIME_MANIFEST_FILENAME;

    #[test]
    fn runtime_manifest_and_installed_artifacts_drive_voice_discovery() {
        let clean_dir = tempfile::tempdir().unwrap();
        let canonical_count = PiperVoiceDefinitions::discover(clean_dir.path())
            .unwrap()
            .len();
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "voices": [{
                    "id": "fixture-catalog-voice",
                    "modelFilename": "fixture-catalog-voice.onnx",
                    "configFilename": "fixture-catalog-voice.onnx.json",
                    "modelUrl": "https://example.invalid/fixture.onnx",
                    "configUrl": "https://example.invalid/fixture.json",
                    "modelSha256": "0".repeat(64),
                    "configSha256": "0".repeat(64),
                    "name": "Fixture voice",
                    "language": "fixture",
                    "quality": "medium",
                    "sampleRate": 24_000,
                    "sizeBytes": 2_000_000
                }]
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            temp_dir.path().join("fixture-installed-voice.onnx"),
            b"fixture",
        )
        .unwrap();
        std::fs::write(
            temp_dir.path().join("fixture-installed-voice.onnx.json"),
            serde_json::json!({ "audio": { "sample_rate": 24_000 } }).to_string(),
        )
        .unwrap();

        let voices = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        assert_eq!(voices.len(), canonical_count + 2);
        assert!(voices
            .iter()
            .any(|voice| voice.id == "fixture-catalog-voice" && !voice.is_downloaded));
        assert!(voices
            .iter()
            .any(|voice| voice.id == "fixture-installed-voice" && voice.is_downloaded));
    }

    #[test]
    fn runtime_manifest_rejects_path_traversal() {
        let temp_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            temp_dir.path().join(RUNTIME_MANIFEST_FILENAME),
            serde_json::json!({
                "voices": [{
                    "id": "fixture-escape-voice",
                    "modelFilename": "../fixture.onnx",
                    "configFilename": "fixture.json",
                    "name": "Fixture",
                    "language": "fixture"
                }]
            })
            .to_string(),
        )
        .unwrap();
        assert!(PiperVoiceDefinitions::discover(temp_dir.path()).is_err());
    }

    #[test]
    fn clean_install_exposes_only_verified_canonical_voice_downloads() {
        let temp_dir = tempfile::tempdir().unwrap();
        let descriptors = piper_voice_descriptors(temp_dir.path()).unwrap();
        let voices = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        assert_eq!(voices.len(), descriptors.len());
        assert!(voices.iter().all(|voice| !voice.is_downloaded));
        assert!(descriptors.iter().all(|entry| {
            entry.model_url.is_some()
                && entry.config_url.is_some()
                && entry.model_sha256.is_some()
                && entry.config_sha256.is_some()
        }));
    }

    #[test]
    fn canonical_voice_is_installed_only_when_model_and_config_are_present() {
        let temp_dir = tempfile::tempdir().unwrap();
        let descriptors = piper_voice_descriptors(temp_dir.path()).unwrap();
        let selected = &descriptors[0];
        std::fs::write(temp_dir.path().join(&selected.model_filename), b"fixture").unwrap();

        let incomplete = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        assert_eq!(incomplete.len(), descriptors.len());
        assert!(incomplete
            .iter()
            .any(|voice| voice.id == selected.id && !voice.is_downloaded));

        std::fs::write(
            temp_dir.path().join(&selected.config_filename),
            serde_json::json!({ "audio": { "sample_rate": selected.sample_rate } }).to_string(),
        )
        .unwrap();
        let complete = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        assert!(complete
            .iter()
            .any(|voice| voice.id == selected.id && voice.is_downloaded));
    }

    #[test]
    fn orphan_custom_model_is_not_advertised_or_selectable() {
        let temp_dir = tempfile::tempdir().unwrap();
        let baseline = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        let orphan_id = "fixture-orphan-voice";
        std::fs::write(
            temp_dir.path().join(format!("{orphan_id}.onnx")),
            b"fixture",
        )
        .unwrap();

        let discovered = PiperVoiceDefinitions::discover(temp_dir.path()).unwrap();
        assert_eq!(discovered.len(), baseline.len());
        assert!(!discovered.iter().any(|voice| voice.id == orphan_id));
    }

    #[test]
    fn test_default_dirs() {
        let models_dir = PiperLocal::default_models_dir();
        assert!(models_dir.is_ok());

        let bin_dir = PiperLocal::default_bin_dir();
        assert!(bin_dir.is_ok());
    }

    #[test]
    fn test_synthesis_config_default() {
        let config = SynthesisConfig::default();
        assert!((config.rate - 1.0).abs() < 0.01);
        assert!((config.volume - 1.0).abs() < 0.01);
    }
}
