//! Text-to-speech integration with barge-in support
//!
//! This module provides TTS (text-to-speech) functionality with support for
//! interruption via barge-in detection. When a user starts speaking while
//! TTS is playing, playback can be stopped within 200ms.

use crate::sys::error::{Error, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[cfg(target_os = "macos")]
use std::process::Child;

/// TTS provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsConfig {
    pub provider: TtsProvider,
    pub api_key: Option<String>,
    pub voice_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TtsProvider {
    #[default]
    System,
    ElevenLabs,
    OpenAi,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            provider: TtsProvider::System,
            api_key: None,
            voice_id: None,
            model_id: None,
        }
    }
}

/// Audio output from TTS
#[derive(Debug, Clone)]
pub struct AudioOutput {
    pub data: Vec<u8>,
    pub format: AudioFormat,
    pub sample_rate: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Wav,
    Pcm,
    Opus,
}

/// Reason for TTS interruption
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TtsInterruptReason {
    /// User interrupted by speaking (barge-in)
    BargeIn,
    /// Manual stop requested
    ManualStop,
    /// Error occurred during playback
    Error,
}

/// Event emitted when TTS playback state changes.
///
/// Failures are NOT a variant here, they leave through `Err`, so a caller
/// cannot mistake one for playback (see `TtsPlayer::speak`). `Started` was
/// likewise removed: it was constructed and immediately discarded, and the only
/// start signal any surface reads is the `voice:tts_started` event the command
/// emits directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TtsPlaybackEvent {
    /// Playback completed naturally
    Completed { text: String, duration_ms: u64 },
    /// Playback was interrupted
    Interrupted {
        text: String,
        reason: TtsInterruptReason,
        played_ms: u64,
    },
}

/// OpenAI's `pcm` speech format and ElevenLabs' `pcm_24000` are both mono
/// signed 16-bit little-endian samples at this rate.
const CLOUD_PCM_SAMPLE_RATE: u32 = 24_000;

fn decode_pcm16_le(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|pair| f32::from(i16::from_le_bytes([pair[0], pair[1]])) / 32_768.0)
        .collect()
}

fn resample_linear(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if samples.is_empty() || from_rate == to_rate || from_rate == 0 || to_rate == 0 {
        return samples.to_vec();
    }
    let ratio = f64::from(from_rate) / f64::from(to_rate);
    let len = ((samples.len() as f64) / ratio).ceil() as usize;
    (0..len)
        .map(|i| {
            let source = i as f64 * ratio;
            let index = source.floor() as usize;
            let next = (index + 1).min(samples.len() - 1);
            let frac = (source - index as f64) as f32;
            let current = samples[index.min(samples.len() - 1)];
            current + (samples[next] - current) * frac
        })
        .collect()
}

/// Play mono 16-bit PCM on the default output device.
async fn play_pcm16_le(bytes: Vec<u8>, sample_rate: u32, stop: Arc<AtomicBool>) -> Result<()> {
    play_samples(decode_pcm16_le(&bytes), sample_rate, stop).await
}

/// Play mono float samples on the default output device. Resolves when the
/// audio has played or `stop` is set; the audio callback reads `stop`, so a
/// stop is heard within one device buffer.
async fn play_samples(samples: Vec<f32>, sample_rate: u32, stop: Arc<AtomicBool>) -> Result<()> {
    tokio::task::spawn_blocking(move || play_samples_blocking(&samples, sample_rate, &stop))
        .await
        .map_err(|e| Error::Generic(format!("Audio playback task failed: {e}")))?
}

fn play_samples_blocking(input: &[f32], sample_rate: u32, stop: &Arc<AtomicBool>) -> Result<()> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    if stop.load(Ordering::SeqCst) {
        return Ok(());
    }
    let device = cpal::default_host()
        .default_output_device()
        .ok_or_else(|| Error::Generic("No audio output device is available".into()))?;
    let supported = device
        .default_output_config()
        .map_err(|e| Error::Generic(format!("Failed to read the audio output config: {e}")))?;
    let output_rate = supported.sample_rate().0;
    let channels = usize::from(supported.channels()).max(1);
    let sample_format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();

    let samples = Arc::new(resample_linear(input, sample_rate, output_rate));
    let total = samples.len();
    let position = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let failed = Arc::new(AtomicBool::new(false));

    let stream = match sample_format {
        cpal::SampleFormat::F32 => build_playback_stream::<f32>(
            &device, &config, channels, &samples, &position, stop, &failed,
        ),
        cpal::SampleFormat::I16 => build_playback_stream::<i16>(
            &device, &config, channels, &samples, &position, stop, &failed,
        ),
        cpal::SampleFormat::U16 => build_playback_stream::<u16>(
            &device, &config, channels, &samples, &position, stop, &failed,
        ),
        cpal::SampleFormat::I32 => build_playback_stream::<i32>(
            &device, &config, channels, &samples, &position, stop, &failed,
        ),
        other => {
            return Err(Error::Generic(format!(
                "Unsupported audio output sample format: {other:?}"
            )))
        }
    }
    .map_err(|e| Error::Generic(format!("Failed to open audio output: {e}")))?;
    stream
        .play()
        .map_err(|e| Error::Generic(format!("Failed to start audio output: {e}")))?;

    while !stop.load(Ordering::SeqCst)
        && !failed.load(Ordering::SeqCst)
        && position.load(Ordering::SeqCst) < total
    {
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    drop(stream);

    if failed.load(Ordering::SeqCst) {
        return Err(Error::Generic("Audio output failed during playback".into()));
    }
    Ok(())
}

fn build_playback_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    samples: &Arc<Vec<f32>>,
    position: &Arc<std::sync::atomic::AtomicUsize>,
    stop: &Arc<AtomicBool>,
    failed: &Arc<AtomicBool>,
) -> std::result::Result<cpal::Stream, cpal::BuildStreamError>
where
    T: cpal::SizedSample + cpal::FromSample<f32>,
{
    use cpal::traits::DeviceTrait;

    let samples = samples.clone();
    let position = position.clone();
    let stop = stop.clone();
    let failed = failed.clone();
    device.build_output_stream(
        config,
        move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
            let silent = stop.load(Ordering::Relaxed);
            for frame in data.chunks_mut(channels) {
                let value = if silent {
                    0.0
                } else {
                    let index = position.fetch_add(1, Ordering::Relaxed);
                    samples.get(index).copied().unwrap_or(0.0)
                };
                for out in frame.iter_mut() {
                    *out = T::from_sample(value);
                }
            }
        },
        move |err| {
            tracing::error!("TTS audio output error: {err}");
            failed.store(true, Ordering::SeqCst);
        },
        None,
    )
}

/// On-device Piper voice, played through the same output path and stop flag
/// as the cloud voices so Stop and barge-in reach it.
pub struct LocalPiperTts {
    models_dir: std::path::PathBuf,
    voice_id: String,
    config: super::local_tts::SynthesisConfig,
    playback_stop: Arc<AtomicBool>,
}

impl LocalPiperTts {
    pub fn new(
        models_dir: std::path::PathBuf,
        voice_id: String,
        config: super::local_tts::SynthesisConfig,
    ) -> Self {
        Self {
            models_dir,
            voice_id,
            config,
            playback_stop: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl TextToSpeech for LocalPiperTts {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput> {
        self.playback_stop.store(false, Ordering::SeqCst);
        let piper = super::local_tts::PiperLocal::new(self.models_dir.clone(), &self.voice_id)
            .map_err(|e| Error::Generic(format!("Failed to initialize Piper: {e}")))?;
        let result = piper
            .synthesize(text, Some(self.config.clone()))
            .await
            .map_err(|e| Error::Generic(format!("TTS synthesis failed: {e}")))?;
        play_samples(
            result.samples,
            result.sample_rate,
            self.playback_stop.clone(),
        )
        .await?;
        Ok(AudioOutput {
            data: Vec::new(),
            format: AudioFormat::Pcm,
            sample_rate: result.sample_rate,
        })
    }

    fn provider_name(&self) -> &'static str {
        "piper"
    }

    fn stop(&self) -> bool {
        !self.playback_stop.swap(true, Ordering::SeqCst)
    }
}

/// TTS trait for different providers
#[async_trait]
pub trait TextToSpeech: Send + Sync {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput>;
    fn provider_name(&self) -> &'static str;
    /// Silence speech this provider is producing right now. Providers that
    /// only return audio bytes have nothing playing to stop.
    fn stop(&self) -> bool {
        false
    }
}

/// Default OpenAI voice model, selected from the canonical catalog.
///
/// Speech synthesis has no task-routing slot, so the catalog's active balanced
/// `tts` entry is the maintained default. Returning its provider wire ID keeps
/// `/v1/audio/speech` correct even when the internal catalog key differs.
pub(crate) fn openai_default_tts_model() -> &'static str {
    let entry = crate::core::llm::models_config::get_all_model_entries()
        .values()
        .filter(|entry| entry.provider == "openai" && entry.model_type == "tts")
        .min_by_key(|entry| {
            (
                entry.deprecated == Some(true),
                entry.quality_tier.as_str() != "balanced",
                entry.id.as_str(),
            )
        });
    entry
        .map(|entry| entry.api_model_id.as_deref().unwrap_or(&entry.id))
        .unwrap_or("")
}

/// ElevenLabs TTS implementation
pub struct ElevenLabsTts {
    config: TtsConfig,
    client: reqwest::Client,
    playback_stop: Arc<AtomicBool>,
}

impl ElevenLabsTts {
    pub fn new(config: TtsConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
            playback_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    fn api_key(&self) -> Result<&str> {
        self.config
            .api_key
            .as_deref()
            .ok_or_else(|| Error::Config("ElevenLabs API key required".into()))
    }

    fn voice_id(&self) -> &str {
        self.config
            .voice_id
            .as_deref()
            .unwrap_or("21m00Tcm4TlvDq8ikWAM") // Default: Rachel
    }

    fn model_id(&self) -> Result<&str> {
        self.config
            .model_id
            .as_deref()
            .filter(|model_id| !model_id.trim().is_empty())
            .ok_or_else(|| {
                Error::Config(
                    "ElevenLabs model is required because the canonical catalog has no provider entry"
                        .into(),
                )
            })
    }
}

#[async_trait]
impl TextToSpeech for ElevenLabsTts {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput> {
        let api_key = self.api_key()?;
        let voice_id = self.voice_id();
        let model_id = self.model_id()?;

        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=pcm_{}",
            voice_id, CLOUD_PCM_SAMPLE_RATE
        );
        self.playback_stop.store(false, Ordering::SeqCst);

        let payload = serde_json::json!({
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        });

        let response = self
            .client
            .post(&url)
            .header("xi-api-key", api_key)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Generic(format!("ElevenLabs API error: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Generic(format!("ElevenLabs error: {}", error_text)));
        }

        let data = response
            .bytes()
            .await
            .map_err(|e| Error::Generic(format!("Failed to read audio: {}", e)))?;

        let data = data.to_vec();
        play_pcm16_le(
            data.clone(),
            CLOUD_PCM_SAMPLE_RATE,
            self.playback_stop.clone(),
        )
        .await?;
        Ok(AudioOutput {
            data,
            format: AudioFormat::Pcm,
            sample_rate: CLOUD_PCM_SAMPLE_RATE,
        })
    }

    fn provider_name(&self) -> &'static str {
        "elevenlabs"
    }

    fn stop(&self) -> bool {
        !self.playback_stop.swap(true, Ordering::SeqCst)
    }
}

/// OpenAI TTS implementation
pub struct OpenAiTts {
    config: TtsConfig,
    client: reqwest::Client,
    playback_stop: Arc<AtomicBool>,
}

impl OpenAiTts {
    pub fn new(config: TtsConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
            playback_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    fn api_key(&self) -> Result<&str> {
        self.config
            .api_key
            .as_deref()
            .ok_or_else(|| Error::Config("OpenAI API key required".into()))
    }

    fn voice(&self) -> &str {
        self.config.voice_id.as_deref().unwrap_or("alloy")
    }

    fn model(&self) -> &str {
        match self.config.model_id.as_deref() {
            Some(model_id) => model_id,
            None => openai_default_tts_model(),
        }
    }
}

#[async_trait]
impl TextToSpeech for OpenAiTts {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput> {
        let api_key = self.api_key()?;

        let payload = serde_json::json!({
            "model": self.model(),
            "input": text,
            "voice": self.voice(),
            "response_format": "pcm"
        });
        self.playback_stop.store(false, Ordering::SeqCst);

        let response = self
            .client
            .post("https://api.openai.com/v1/audio/speech")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Generic(format!("OpenAI TTS API error: {}", e)))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Generic(format!("OpenAI TTS error: {}", error_text)));
        }

        let data = response
            .bytes()
            .await
            .map_err(|e| Error::Generic(format!("Failed to read audio: {}", e)))?;

        let data = data.to_vec();
        play_pcm16_le(
            data.clone(),
            CLOUD_PCM_SAMPLE_RATE,
            self.playback_stop.clone(),
        )
        .await?;
        Ok(AudioOutput {
            data,
            format: AudioFormat::Pcm,
            sample_rate: CLOUD_PCM_SAMPLE_RATE,
        })
    }

    fn provider_name(&self) -> &'static str {
        "openai"
    }

    fn stop(&self) -> bool {
        !self.playback_stop.swap(true, Ordering::SeqCst)
    }
}

/// System TTS (uses OS native TTS) with playback control
pub struct SystemTts {
    /// Flag indicating if playback is in progress
    is_playing: Arc<AtomicBool>,
    /// Handle to the current playback process (macOS)
    #[cfg(target_os = "macos")]
    current_process: Arc<std::sync::Mutex<Option<Child>>>,
}

impl SystemTts {
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            #[cfg(target_os = "macos")]
            current_process: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Whether this build can actually drive the OS speech synthesiser.
    ///
    /// Only the macOS arm of `speak_sync` is implemented, every other target
    /// returns "System TTS not implemented for this platform". Callers that
    /// REPORT availability (`voice_get_capabilities`) or enumerate voices must
    /// gate on this instead of on `TtsProvider::System` being selected, which
    /// is merely the default and true everywhere.
    pub const fn platform_supported() -> bool {
        cfg!(target_os = "macos")
    }

    /// Check if TTS is currently playing
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::SeqCst)
    }

    /// Stop current playback immediately
    ///
    /// Returns true if playback was stopped, false if nothing was playing
    pub fn stop_playback(&self) -> bool {
        if !self.is_playing.load(Ordering::SeqCst) {
            return false;
        }

        #[cfg(target_os = "macos")]
        {
            // Kill only our tracked say process, not system-wide
            if let Ok(mut guard) = self.current_process.lock() {
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                    let _ = child.wait(); // Reap zombie process
                }
                *guard = None;
            }
        }

        self.is_playing.store(false, Ordering::SeqCst);
        tracing::debug!("TTS playback stopped");
        true
    }

    /// Speak text using system TTS (macOS say command, etc.)
    pub fn speak_sync(&self, text: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            self.is_playing.store(true, Ordering::SeqCst);

            let child = std::process::Command::new("say")
                .arg(text)
                .spawn()
                .map_err(|e| {
                    self.is_playing.store(false, Ordering::SeqCst);
                    Error::Generic(format!("TTS error: {}", e))
                })?;

            // Store the process handle
            if let Ok(mut guard) = self.current_process.lock() {
                *guard = Some(child);
            }

            Ok(())
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = text;
            Err(Error::Generic(
                "System TTS not implemented for this platform".into(),
            ))
        }
    }
}

#[async_trait]
impl TextToSpeech for SystemTts {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput> {
        // System TTS doesn't return audio data, just speaks directly
        self.speak_sync(text)?;

        // Resolve when `say` finishes or is killed by `stop`, so a caller's
        // completion means the speech actually ended.
        #[cfg(target_os = "macos")]
        loop {
            let finished = match self.current_process.lock() {
                Ok(mut guard) => match guard.as_mut() {
                    None => true,
                    Some(child) => match child.try_wait() {
                        Ok(None) => false,
                        Ok(Some(_)) | Err(_) => {
                            *guard = None;
                            true
                        }
                    },
                },
                Err(_) => true,
            };
            if finished {
                self.is_playing.store(false, Ordering::SeqCst);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        Ok(AudioOutput {
            data: vec![],
            format: AudioFormat::Pcm,
            sample_rate: 0,
        })
    }

    fn provider_name(&self) -> &'static str {
        "system"
    }

    fn stop(&self) -> bool {
        self.stop_playback()
    }
}

impl Default for SystemTts {
    fn default() -> Self {
        Self::new()
    }
}

/// Create TTS provider from config
pub fn create_tts_provider(config: TtsConfig) -> Box<dyn TextToSpeech> {
    match config.provider {
        TtsProvider::ElevenLabs => Box::new(ElevenLabsTts::new(config)),
        TtsProvider::OpenAi => Box::new(OpenAiTts::new(config)),
        TtsProvider::System => Box::new(SystemTts::new()),
    }
}

/// TTS player with barge-in support
///
/// This wrapper provides playback control and integrates with barge-in detection
/// to allow interruption of TTS when the user starts speaking.
pub struct TtsPlayer {
    provider: Box<dyn TextToSpeech>,
    is_playing: Arc<AtomicBool>,
    current_text: Arc<std::sync::Mutex<Option<String>>>,
    playback_start: Arc<std::sync::Mutex<Option<std::time::Instant>>>,
}

impl TtsPlayer {
    /// Create a new TTS player with the given provider
    pub fn new(provider: Box<dyn TextToSpeech>) -> Self {
        Self {
            provider,
            is_playing: Arc::new(AtomicBool::new(false)),
            current_text: Arc::new(std::sync::Mutex::new(None)),
            playback_start: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Create a TTS player from config
    pub fn from_config(config: TtsConfig) -> Self {
        Self::new(create_tts_provider(config))
    }

    /// Check if TTS is currently playing
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::SeqCst)
    }

    /// Get the text currently being spoken
    pub fn current_text(&self) -> Option<String> {
        self.current_text.lock().ok().and_then(|g| g.clone())
    }

    /// Get elapsed playback time in milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.playback_start
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|t| t.elapsed().as_millis() as u64))
            .unwrap_or(0)
    }

    /// Start TTS playback
    ///
    /// Returns an error if already playing
    pub async fn speak(&self, text: &str) -> Result<TtsPlaybackEvent> {
        if self.is_playing.load(Ordering::SeqCst) {
            return Err(Error::Generic("TTS is already playing".into()));
        }

        // Set state
        self.is_playing.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.current_text.lock() {
            *guard = Some(text.to_string());
        }
        if let Ok(mut guard) = self.playback_start.lock() {
            *guard = Some(std::time::Instant::now());
        }

        // Synthesize (this is async and may take a while for network-based providers)
        let result = self.provider.synthesize(text).await;

        // `stop_playback` clears the flag first, so a cleared flag here means
        // this speech was cut off rather than finished.
        let stopped = !self.is_playing.swap(false, Ordering::SeqCst);
        let duration_ms = self.elapsed_ms();

        if let Ok(mut guard) = self.current_text.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = self.playback_start.lock() {
            *guard = None;
        }

        // A synthesis failure must leave as a failure. This used to return
        // `Ok(TtsPlaybackEvent::Error { .. })`, and nothing anywhere inspected
        // the returned variant: `voice_tts_speak_with_barge_in` took its `Ok`
        // arm, emitted `voice:tts_completed`, and resolved the promise. On
        // Windows and Linux, where `SystemTts` cannot speak at all, the user
        // heard nothing while every layer above reported success, including the
        // browser-TTS fallback in `useTTS.speakWithBargeIn`, which is wired to
        // a rejected promise and so never ran.
        result.map(|_| {
            if stopped {
                TtsPlaybackEvent::Interrupted {
                    text: text.to_string(),
                    reason: TtsInterruptReason::ManualStop,
                    played_ms: duration_ms,
                }
            } else {
                TtsPlaybackEvent::Completed {
                    text: text.to_string(),
                    duration_ms,
                }
            }
        })
    }

    /// Stop playback immediately
    ///
    /// Returns a TtsPlaybackEvent::Interrupted if playback was stopped,
    /// or None if nothing was playing.
    pub fn stop_playback(&self, reason: TtsInterruptReason) -> Option<TtsPlaybackEvent> {
        if !self.is_playing.load(Ordering::SeqCst) {
            return None;
        }

        let text = self.current_text();
        let played_ms = self.elapsed_ms();

        self.provider.stop();

        // Clear state
        self.is_playing.store(false, Ordering::SeqCst);
        if let Ok(mut guard) = self.current_text.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = self.playback_start.lock() {
            *guard = None;
        }

        tracing::info!(
            "TTS playback interrupted: reason={:?}, played_ms={}",
            reason,
            played_ms
        );

        Some(TtsPlaybackEvent::Interrupted {
            text: text.unwrap_or_default(),
            reason,
            played_ms,
        })
    }

    /// Stop playback due to barge-in
    pub fn handle_barge_in(&self) -> Option<TtsPlaybackEvent> {
        self.stop_playback(TtsInterruptReason::BargeIn)
    }

    /// Get the provider name
    pub fn provider_name(&self) -> &'static str {
        self.provider.provider_name()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tts_config_default() {
        let config = TtsConfig::default();
        assert!(matches!(config.provider, TtsProvider::System));
        assert!(config.api_key.is_none());
        assert!(config.voice_id.is_none());
        assert!(config.model_id.is_none());
    }

    #[test]
    fn unconfigured_elevenlabs_model_fails_closed() {
        let eleven = ElevenLabsTts::new(TtsConfig {
            provider: TtsProvider::ElevenLabs,
            api_key: Some("fixture-key".into()),
            voice_id: None,
            model_id: None,
        });
        assert!(eleven.model_id().is_err());
    }

    /// The retired-list check above only catches ids someone remembered to add
    /// to it. This one catches the general case for the provider the catalog
    /// actually covers: the selected default must still be a canonical OpenAI
    /// TTS model. A catalog replacement is picked up without editing this file.
    ///
    #[test]
    fn openai_default_is_a_canonical_registry_model() {
        let catalog_id =
            crate::core::llm::models_config::get_canonicalized_id(openai_default_tts_model());
        let entry = crate::core::llm::models_config::get_all_model_entries()
            .get(&catalog_id)
            .expect("the catalog must expose a balanced OpenAI TTS model");
        assert_eq!(entry.provider, "openai");
        assert_eq!(entry.model_type, "tts");
    }

    #[test]
    fn configured_non_catalog_provider_and_catalog_default_survive_plumbing() {
        let eleven = ElevenLabsTts::new(TtsConfig {
            provider: TtsProvider::ElevenLabs,
            api_key: Some("fixture-key".into()),
            voice_id: None,
            model_id: Some("fixture-elevenlabs-tts".into()),
        });
        assert_eq!(eleven.model_id().unwrap(), "fixture-elevenlabs-tts");

        let openai = OpenAiTts::new(TtsConfig {
            provider: TtsProvider::OpenAi,
            api_key: Some("fixture-key".into()),
            voice_id: None,
            model_id: None,
        });
        assert_eq!(openai.model(), openai_default_tts_model());
    }

    #[test]
    fn test_tts_interrupt_reason_serialization() {
        let reason = TtsInterruptReason::BargeIn;
        let json = serde_json::to_string(&reason).unwrap();
        assert_eq!(json, "\"barge_in\"");
    }

    #[test]
    fn test_tts_playback_event_serialization() {
        let event = TtsPlaybackEvent::Interrupted {
            text: "Hello".to_string(),
            reason: TtsInterruptReason::BargeIn,
            played_ms: 150,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Interrupted"));
        assert!(json.contains("barge_in"));
    }

    #[test]
    fn test_system_tts_is_playing() {
        let tts = SystemTts::new();
        assert!(!tts.is_playing());
    }

    /// `platform_supported()` must track the ONLY arm of `speak_sync` that is
    /// implemented. Asserted from the unsupported side, which is where the
    /// capability lie lived, on macOS this only pins the constant, without
    /// spawning `say` into a test run.
    #[test]
    fn system_tts_platform_support_matches_the_implemented_speak_arm() {
        const {
            assert!(
                !SystemTts::platform_supported() || cfg!(target_os = "macos"),
                "only macOS implements speak_sync"
            );
        }
        if SystemTts::platform_supported() {
            return;
        }

        let err = SystemTts::new()
            .speak_sync("probe")
            .expect_err("platform claims no support yet speak_sync succeeded");
        assert!(
            err.to_string().contains("not implemented"),
            "unsupported platform must say so explicitly, got: {err}"
        );
    }

    #[test]
    fn test_tts_player_initial_state() {
        let player = TtsPlayer::from_config(TtsConfig::default());
        assert!(!player.is_playing());
        assert!(player.current_text().is_none());
        assert_eq!(player.elapsed_ms(), 0);
    }

    /// A provider that cannot speak, stands in for `SystemTts` on Windows and
    /// Linux, and for a network provider that is down.
    struct FailingTts;

    #[async_trait]
    impl TextToSpeech for FailingTts {
        async fn synthesize(&self, _text: &str) -> Result<AudioOutput> {
            Err(Error::Generic(
                "System TTS not implemented for this platform".into(),
            ))
        }
        fn provider_name(&self) -> &'static str {
            "failing"
        }
    }

    struct SilentOkTts;

    #[async_trait]
    impl TextToSpeech for SilentOkTts {
        async fn synthesize(&self, _text: &str) -> Result<AudioOutput> {
            Ok(AudioOutput {
                data: vec![],
                format: AudioFormat::Pcm,
                sample_rate: 0,
            })
        }
        fn provider_name(&self) -> &'static str {
            "silent-ok"
        }
    }

    /// THE regression. `speak` used to wrap a synthesis failure as
    /// `Ok(TtsPlaybackEvent::Error { .. })`, which `voice_tts_speak_with_barge_in`
    /// read as its success arm, it emitted `voice:tts_completed` and resolved
    /// the promise, so the frontend's catch-based fallback to browser TTS never
    /// ran and the user got silence reported as success.
    #[tokio::test]
    async fn speak_surfaces_a_synthesis_failure_as_an_error() {
        let player = TtsPlayer::new(Box::new(FailingTts));
        let err = player
            .speak("hello")
            .await
            .expect_err("a provider that cannot synthesize must not report playback");
        assert!(err.to_string().contains("not implemented"), "got: {err}");
        assert!(!player.is_playing(), "failed playback must clear its state");
        assert!(player.current_text().is_none());
    }

    #[tokio::test]
    async fn speak_reports_completion_when_the_provider_succeeds() {
        let player = TtsPlayer::new(Box::new(SilentOkTts));
        let event = player.speak("hello").await.unwrap();
        assert!(matches!(event, TtsPlaybackEvent::Completed { .. }));
        assert!(!player.is_playing());
    }

    /// Speaks until `stop` is called, like `say` on macOS.
    struct SpeakingTts {
        stopped: tokio::sync::Notify,
    }

    #[async_trait]
    impl TextToSpeech for SpeakingTts {
        async fn synthesize(&self, _text: &str) -> Result<AudioOutput> {
            self.stopped.notified().await;
            Ok(AudioOutput {
                data: vec![],
                format: AudioFormat::Pcm,
                sample_rate: 0,
            })
        }
        fn provider_name(&self) -> &'static str {
            "speaking"
        }
        fn stop(&self) -> bool {
            self.stopped.notify_one();
            true
        }
    }

    #[tokio::test]
    async fn stopping_mid_speech_silences_the_provider_and_is_not_reported_as_completed() {
        let player = Arc::new(TtsPlayer::new(Box::new(SpeakingTts {
            stopped: tokio::sync::Notify::new(),
        })));
        let speaking = {
            let player = player.clone();
            tokio::spawn(async move { player.speak("a long answer").await })
        };
        while !player.is_playing() {
            tokio::task::yield_now().await;
        }

        let interrupted = player.stop_playback(TtsInterruptReason::ManualStop);
        assert!(matches!(
            interrupted,
            Some(TtsPlaybackEvent::Interrupted { .. })
        ));

        let finished = speaking.await.unwrap().unwrap();
        assert!(matches!(finished, TtsPlaybackEvent::Interrupted { .. }));
        assert!(!player.is_playing());
    }

    #[test]
    fn cloud_pcm_decodes_as_signed_little_endian() {
        let samples = decode_pcm16_le(&[0x00, 0x80, 0xff, 0x7f, 0x00, 0x00, 0x01]);
        assert_eq!(samples.len(), 3, "a trailing odd byte is not a sample");
        assert_eq!(samples[0], -1.0);
        assert!((samples[1] - 32_767.0 / 32_768.0).abs() < f32::EPSILON);
        assert_eq!(samples[2], 0.0);
    }

    #[test]
    fn resampling_keeps_duration_and_endpoints() {
        let one_second = vec![0.25_f32; 24_000];
        let resampled = resample_linear(&one_second, 24_000, 48_000);
        assert_eq!(resampled.len(), 48_000);
        assert!(resampled.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
        assert_eq!(resample_linear(&one_second, 24_000, 24_000).len(), 24_000);
        assert!(resample_linear(&[], 24_000, 48_000).is_empty());
    }

    #[tokio::test]
    async fn a_stop_before_playback_plays_nothing() {
        let stop = Arc::new(AtomicBool::new(true));
        play_pcm16_le(vec![0, 0, 0, 0], CLOUD_PCM_SAMPLE_RATE, stop)
            .await
            .expect("a stopped playback resolves without touching the audio device");
    }

    #[test]
    fn cloud_providers_can_be_stopped() {
        let openai = OpenAiTts::new(TtsConfig {
            provider: TtsProvider::OpenAi,
            api_key: Some("key".into()),
            voice_id: None,
            model_id: None,
        });
        assert!(openai.stop());
        assert!(openai.playback_stop.load(Ordering::SeqCst));
        assert!(!openai.stop(), "a second stop has nothing left to stop");
    }

    #[test]
    fn the_local_piper_voice_can_be_stopped() {
        let models_dir = std::path::PathBuf::from("/tmp/piper");
        let voice = super::super::artifact_registry::piper_voice_descriptors(&models_dir)
            .expect("the speech artifact catalog loads")
            .into_iter()
            .next()
            .expect("the catalog lists a Piper voice");
        let piper = LocalPiperTts::new(
            models_dir,
            voice.id,
            super::super::local_tts::SynthesisConfig::default(),
        );
        assert_eq!(piper.provider_name(), "piper");
        assert!(piper.stop());
        assert!(!piper.stop());
    }
}
