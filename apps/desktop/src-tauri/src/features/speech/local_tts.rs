//! Local Text-to-Speech using Piper
//!
//! Provides offline TTS capability using Piper, a fast neural TTS engine.
//! This serves as a fallback when cloud services are unavailable or when
//! the user prefers local processing for privacy.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
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
    /// Unique voice identifier (e.g., "en_US-lessac-medium")
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
    /// Whether to output raw PCM or WAV
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

/// Popular Piper voice definitions for easy downloading
pub struct PiperVoiceDefinitions;

impl PiperVoiceDefinitions {
    /// Get a list of popular voices that can be downloaded
    pub fn popular_voices() -> Vec<VoiceInfo> {
        vec![
            VoiceInfo {
                id: "en_US-lessac-medium".to_string(),
                name: "Lessac (US English)".to_string(),
                language: "en_US".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("High-quality US English voice, natural sounding".to_string()),
            },
            VoiceInfo {
                id: "en_US-amy-medium".to_string(),
                name: "Amy (US English)".to_string(),
                language: "en_US".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("Female US English voice".to_string()),
            },
            VoiceInfo {
                id: "en_GB-alan-medium".to_string(),
                name: "Alan (British English)".to_string(),
                language: "en_GB".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("Male British English voice".to_string()),
            },
            VoiceInfo {
                id: "en_US-ryan-medium".to_string(),
                name: "Ryan (US English)".to_string(),
                language: "en_US".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("Male US English voice".to_string()),
            },
            VoiceInfo {
                id: "de_DE-thorsten-medium".to_string(),
                name: "Thorsten (German)".to_string(),
                language: "de_DE".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("German male voice".to_string()),
            },
            VoiceInfo {
                id: "es_ES-carlfm-medium".to_string(),
                name: "Carlfm (Spanish)".to_string(),
                language: "es_ES".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("Spanish male voice".to_string()),
            },
            VoiceInfo {
                id: "fr_FR-siwis-medium".to_string(),
                name: "Siwis (French)".to_string(),
                language: "fr_FR".to_string(),
                quality: PiperQuality::Medium,
                is_downloaded: false,
                model_path: None,
                sample_rate: 22050,
                size_mb: 63,
                description: Some("French voice".to_string()),
            },
        ]
    }

    /// Get download URL for a voice
    pub fn download_url(voice_id: &str) -> String {
        // Piper voices are hosted on Hugging Face
        format!(
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/{}/{}.onnx",
            voice_id.replace('-', "/").split('/').next().unwrap_or("en"),
            voice_id
        )
    }

    /// Get download URL for voice config JSON
    pub fn config_url(voice_id: &str) -> String {
        format!(
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/{}/{}.onnx.json",
            voice_id.replace('-', "/").split('/').next().unwrap_or("en"),
            voice_id
        )
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
    /// Voice config path (reserved for runtime voice switching)
    #[allow(dead_code)]
    config_path: PathBuf,
    /// Voice sample rate
    sample_rate: u32,
}

impl PiperLocal {
    /// Create a new PiperLocal instance
    ///
    /// # Arguments
    /// * `models_dir` - Directory containing Piper voice models
    /// * `voice_id` - Voice identifier to use (e.g., "en_US-lessac-medium")
    pub fn new(models_dir: PathBuf, voice_id: &str) -> Result<Self> {
        let piper_path = Self::find_piper_binary()?;
        let model_path = models_dir.join(format!("{}.onnx", voice_id));
        let config_path = models_dir.join(format!("{}.onnx.json", voice_id));

        if !model_path.exists() {
            return Err(anyhow!(
                "Piper voice model not found at {:?}. Please download it first.",
                model_path
            ));
        }

        // Try to read sample rate from config
        let sample_rate = if config_path.exists() {
            Self::read_sample_rate(&config_path).unwrap_or(22050)
        } else {
            22050
        };

        Ok(Self {
            piper_path,
            models_dir,
            voice_id: voice_id.to_string(),
            model_path,
            config_path,
            sample_rate,
        })
    }

    /// Create instance without verifying model exists (for deferred loading)
    pub fn new_deferred(models_dir: PathBuf, voice_id: &str) -> Self {
        let piper_path = Self::find_piper_binary().unwrap_or_else(|_| PathBuf::from("piper"));
        let model_path = models_dir.join(format!("{}.onnx", voice_id));
        let config_path = models_dir.join(format!("{}.onnx.json", voice_id));

        Self {
            piper_path,
            models_dir,
            voice_id: voice_id.to_string(),
            model_path,
            config_path,
            sample_rate: 22050,
        }
    }

    /// Find the Piper binary on the system
    fn find_piper_binary() -> Result<PathBuf> {
        // Check common locations
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
        let mut voices = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&self.models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "onnx").unwrap_or(false) {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        let voice_id = stem.to_string();

                        // Try to parse language and quality from voice ID
                        let parts: Vec<&str> = voice_id.split('-').collect();
                        let language = parts.first().unwrap_or(&"unknown").to_string();
                        let quality = parts
                            .last()
                            .map(|q| match *q {
                                "low" => PiperQuality::Low,
                                "high" => PiperQuality::High,
                                _ => PiperQuality::Medium,
                            })
                            .unwrap_or(PiperQuality::Medium);

                        let config_path = self.models_dir.join(format!("{}.onnx.json", voice_id));
                        let sample_rate = if config_path.exists() {
                            Self::read_sample_rate(&config_path).unwrap_or(22050)
                        } else {
                            22050
                        };

                        voices.push(VoiceInfo {
                            id: voice_id.clone(),
                            name: voice_id.replace(['-', '_'], " "),
                            language,
                            quality,
                            is_downloaded: true,
                            model_path: Some(path.clone()),
                            sample_rate,
                            size_mb: std::fs::metadata(&path)
                                .map(|m| m.len() / 1_000_000)
                                .unwrap_or(0),
                            description: None,
                        });
                    }
                }
            }
        }

        voices
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

        let model_path = models_dir.join(format!("{}.onnx", voice_id));
        let config_path = models_dir.join(format!("{}.onnx.json", voice_id));

        // Check if already downloaded
        if model_path.exists() && config_path.exists() {
            tracing::info!("Piper voice already exists at {:?}", model_path);
            return Ok(model_path);
        }

        let client = reqwest::Client::new();

        // Download model file
        let model_url = PiperVoiceDefinitions::download_url(voice_id);
        tracing::info!("Downloading Piper voice {} from {}", voice_id, model_url);

        Self::download_file(&client, &model_url, &model_path, &progress).await?;

        // Download config file
        let config_url = PiperVoiceDefinitions::config_url(voice_id);
        tracing::info!("Downloading Piper voice config from {}", config_url);

        // Config is small, no progress needed
        Self::download_file(&client, &config_url, &config_path, |_, _| {}).await?;

        tracing::info!("Piper voice downloaded to {:?}", model_path);
        Ok(model_path)
    }

    /// Helper to download a file with progress
    async fn download_file<F>(
        client: &reqwest::Client,
        url: &str,
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

        let total_size = response.content_length().unwrap_or(0);

        let temp_path = path.with_extension("tmp");
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

        let piper_path = bin_dir.join("piper");

        if piper_path.exists() {
            tracing::info!("Piper binary already exists at {:?}", piper_path);
            return Ok(piper_path);
        }

        // Determine platform-specific URL
        let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);

        let download_url = match (os, arch) {
            ("macos", "aarch64") => {
                "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz"
            }
            ("macos", "x86_64") => {
                "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz"
            }
            ("linux", "x86_64") => {
                "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
            }
            ("linux", "aarch64") => {
                "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz"
            }
            ("windows", "x86_64") => {
                "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
            }
            _ => {
                return Err(anyhow!(
                    "Unsupported platform: {} {}. Please install Piper manually.",
                    os,
                    arch
                ));
            }
        };

        tracing::info!("Downloading Piper from {}", download_url);

        let client = reqwest::Client::new();
        let response = client
            .get(download_url)
            .send()
            .await
            .context("Failed to start Piper download")?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Failed to download Piper: HTTP {}",
                response.status()
            ));
        }

        let total_size = response.content_length().unwrap_or(50_000_000); // ~50MB estimate
        let temp_archive = bin_dir.join("piper_download.tmp");

        let mut file = tokio::fs::File::create(&temp_archive)
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

        file.flush().await?;
        drop(file);

        // Extract the archive
        tracing::info!("Extracting Piper archive");

        if download_url.ends_with(".tar.gz") {
            // Extract tar.gz
            let tar_gz = std::fs::File::open(&temp_archive)?;
            let tar = flate2::read::GzDecoder::new(tar_gz);
            let mut archive = tar::Archive::new(tar);

            for entry in archive.entries()? {
                let mut entry = entry?;
                let path = entry.path()?;

                // Look for the piper binary
                if path.file_name().map(|n| n == "piper").unwrap_or(false) {
                    let mut piper_file = std::fs::File::create(&piper_path)?;
                    std::io::copy(&mut entry, &mut piper_file)?;

                    // Make executable
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        std::fs::set_permissions(
                            &piper_path,
                            std::fs::Permissions::from_mode(0o755),
                        )?;
                    }

                    break;
                }
            }
        } else if download_url.ends_with(".zip") {
            // Extract zip (Windows)
            let file = std::fs::File::open(&temp_archive)?;
            let mut archive = zip::ZipArchive::new(file)?;

            for i in 0..archive.len() {
                let mut file = archive.by_index(i)?;
                let outpath = match file.enclosed_name() {
                    Some(path) => path.to_owned(),
                    None => continue,
                };

                if outpath
                    .file_name()
                    .map(|n| n == "piper.exe")
                    .unwrap_or(false)
                {
                    let mut piper_file = std::fs::File::create(&piper_path)?;
                    std::io::copy(&mut file, &mut piper_file)?;
                    break;
                }
            }
        }

        // Cleanup temp file
        tokio::fs::remove_file(&temp_archive).await.ok();

        if !piper_path.exists() {
            return Err(anyhow!("Failed to extract Piper binary from archive"));
        }

        tracing::info!("Piper installed to {:?}", piper_path);
        Ok(piper_path)
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
        let model_path = models_dir.join(format!("{}.onnx", voice_id));
        let config_path = models_dir.join(format!("{}.onnx.json", voice_id));

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

    #[test]
    fn test_voice_definitions() {
        let voices = PiperVoiceDefinitions::popular_voices();
        assert!(!voices.is_empty());

        let lessac = voices.iter().find(|v| v.id == "en_US-lessac-medium");
        assert!(lessac.is_some());
    }

    #[test]
    fn test_download_urls() {
        let url = PiperVoiceDefinitions::download_url("en_US-lessac-medium");
        assert!(url.contains("piper-voices"));
        assert!(url.ends_with(".onnx"));
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
