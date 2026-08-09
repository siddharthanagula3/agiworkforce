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

/// Voice metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voice {
    pub id: String,
    pub name: String,
    pub preview_url: Option<String>,
    pub category: Option<String>,
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

/// Event emitted when TTS playback state changes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TtsPlaybackEvent {
    /// Playback started
    Started { text: String },
    /// Playback completed naturally
    Completed { text: String, duration_ms: u64 },
    /// Playback was interrupted
    Interrupted {
        text: String,
        reason: TtsInterruptReason,
        played_ms: u64,
    },
    /// Error during playback
    Error { text: String, error: String },
}

/// TTS trait for different providers
#[async_trait]
pub trait TextToSpeech: Send + Sync {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput>;
    async fn list_voices(&self) -> Result<Vec<Voice>>;
    fn provider_name(&self) -> &'static str;
}

/// Default ElevenLabs voice model.
///
/// `eleven_monolingual_v1` used to be the default here. It was deprecated and
/// REMOVED upstream on 2026-07-09, so every barge-in playback that did not
/// carry an explicit `model_id` was calling a model that no longer exists.
///
/// Flash v2.5 is ElevenLabs' recommendation for real-time voice agents (~75ms),
/// which is what this module is — spoken replies that must stop inside 200ms
/// when the user talks over them. `eleven_multilingual_v2` is the higher-quality
/// alternative and is the one to switch to if narration ever outranks latency.
/// Verified 2026-07-28 against elevenlabs.io/docs/overview/models.
const ELEVENLABS_DEFAULT_MODEL: &str = "eleven_flash_v2_5";

/// Default OpenAI voice model.
///
/// Was `tts-1` (November 2023). `gpt-4o-mini-tts` costs $0.60/1M input text
/// tokens + $12/1M output audio tokens against tts-1's flat $15/1M characters.
/// Default snapshot `gpt-4o-mini-tts-2025-12-15`; the unversioned id tracks it.
///
/// This model carries a Deprecated badge on OpenAI's catalog listing and is
/// still the right choice, which needs explaining. It is the ONLY model served
/// on `/v1/audio/speech` — `gpt-audio-1.5`'s model page lists that endpoint as
/// "Not supported", the deprecations table names no successor, and no shutdown
/// date is published. OpenAI is steering speech generation toward audio-native
/// chat and realtime, neither of which is a drop-in for a REST speech call.
/// So there is no newer member of this family to move to; when one appears, or
/// when a shutdown date is published, this path should move to ElevenLabs or
/// local Piper rather than wait. Verified 2026-07-28 against
/// developers.openai.com/api/docs/models and .../guides/text-to-speech.
///
/// Not *resolved* from the model catalog because speech synthesis has no
/// routing slot — `routing-policies.json` defines `voice_transcription` and
/// `voice_rewrite` and nothing for speech out — and the catalog carries no
/// ElevenLabs provider at all, so only half this decision could come from
/// there. Adding a speech slot is tracked as a follow-up.
///
/// It is still *checked* against the catalog: `openai_default_is_a_canonical_
/// registry_model` below fails if this id stops being an OpenAI key in the
/// generated registry, so the constant cannot drift into a model the rest of
/// the product does not know about.
const OPENAI_DEFAULT_TTS_MODEL: &str = "gpt-4o-mini-tts";

/// ElevenLabs TTS implementation
pub struct ElevenLabsTts {
    config: TtsConfig,
    client: reqwest::Client,
}

impl ElevenLabsTts {
    pub fn new(config: TtsConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
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

    fn model_id(&self) -> &str {
        self.config
            .model_id
            .as_deref()
            .unwrap_or(ELEVENLABS_DEFAULT_MODEL)
    }
}

#[async_trait]
impl TextToSpeech for ElevenLabsTts {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput> {
        let api_key = self.api_key()?;
        let voice_id = self.voice_id();

        let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);

        let payload = serde_json::json!({
            "text": text,
            "model_id": self.model_id(),
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
            .header("Accept", "audio/mpeg")
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

        Ok(AudioOutput {
            data: data.to_vec(),
            format: AudioFormat::Mp3,
            sample_rate: 44100,
        })
    }

    async fn list_voices(&self) -> Result<Vec<Voice>> {
        let api_key = self.api_key()?;

        let response = self
            .client
            .get("https://api.elevenlabs.io/v1/voices")
            .header("xi-api-key", api_key)
            .send()
            .await
            .map_err(|e| Error::Generic(format!("ElevenLabs API error: {}", e)))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| Error::Generic(format!("Failed to parse voices: {}", e)))?;

        let voices = data["voices"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .map(|v| Voice {
                id: v["voice_id"].as_str().unwrap_or("").to_string(),
                name: v["name"].as_str().unwrap_or("").to_string(),
                preview_url: v["preview_url"].as_str().map(String::from),
                category: v["category"].as_str().map(String::from),
            })
            .collect();

        Ok(voices)
    }

    fn provider_name(&self) -> &'static str {
        "elevenlabs"
    }
}

/// OpenAI TTS implementation
pub struct OpenAiTts {
    config: TtsConfig,
    client: reqwest::Client,
}

impl OpenAiTts {
    pub fn new(config: TtsConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
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
        self.config
            .model_id
            .as_deref()
            .unwrap_or(OPENAI_DEFAULT_TTS_MODEL)
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
            "response_format": "mp3"
        });

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

        Ok(AudioOutput {
            data: data.to_vec(),
            format: AudioFormat::Mp3,
            sample_rate: 24000,
        })
    }

    async fn list_voices(&self) -> Result<Vec<Voice>> {
        Ok(vec![
            Voice {
                id: "alloy".to_string(),
                name: "Alloy".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
            Voice {
                id: "echo".to_string(),
                name: "Echo".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
            Voice {
                id: "fable".to_string(),
                name: "Fable".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
            Voice {
                id: "onyx".to_string(),
                name: "Onyx".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
            Voice {
                id: "nova".to_string(),
                name: "Nova".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
            Voice {
                id: "shimmer".to_string(),
                name: "Shimmer".to_string(),
                preview_url: None,
                category: Some("openai".to_string()),
            },
        ])
    }

    fn provider_name(&self) -> &'static str {
        "openai"
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

    /// Speak text and wait for completion
    pub fn speak_sync_blocking(&self, text: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            self.is_playing.store(true, Ordering::SeqCst);

            let status = std::process::Command::new("say")
                .arg(text)
                .status()
                .map_err(|e| {
                    self.is_playing.store(false, Ordering::SeqCst);
                    Error::Generic(format!("TTS error: {}", e))
                })?;

            self.is_playing.store(false, Ordering::SeqCst);

            if status.success() {
                Ok(())
            } else {
                Err(Error::Generic("TTS process exited with error".into()))
            }
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

        Ok(AudioOutput {
            data: vec![],
            format: AudioFormat::Pcm,
            sample_rate: 0,
        })
    }

    async fn list_voices(&self) -> Result<Vec<Voice>> {
        // Would use system API to list voices
        Ok(vec![Voice {
            id: "system-default".to_string(),
            name: "System Default".to_string(),
            preview_url: None,
            category: Some("system".to_string()),
        }])
    }

    fn provider_name(&self) -> &'static str {
        "system"
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

        let start_event = TtsPlaybackEvent::Started {
            text: text.to_string(),
        };

        // Synthesize (this is async and may take a while for network-based providers)
        let result = self.provider.synthesize(text).await;

        // Clear state
        self.is_playing.store(false, Ordering::SeqCst);
        let duration_ms = self.elapsed_ms();

        if let Ok(mut guard) = self.current_text.lock() {
            *guard = None;
        }
        if let Ok(mut guard) = self.playback_start.lock() {
            *guard = None;
        }

        match result {
            Ok(_) => Ok(TtsPlaybackEvent::Completed {
                text: text.to_string(),
                duration_ms,
            }),
            Err(e) => {
                let _ = start_event; // Suppress unused warning
                Ok(TtsPlaybackEvent::Error {
                    text: text.to_string(),
                    error: e.to_string(),
                })
            }
        }
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

    /// A default that names a retired model turns every un-configured voice
    /// reply into an upstream 4xx, and nothing else in the suite would notice:
    /// `TtsConfig::default()` leaves `model_id` as `None`, so the fallback IS
    /// the shipped behaviour for anyone who never opened voice settings.
    /// `eleven_monolingual_v1` reached that state on 2026-07-09.
    #[test]
    fn tts_defaults_are_not_retired_models() {
        const RETIRED: &[&str] = &[
            "eleven_monolingual_v1",
            "eleven_multilingual_v1",
            "eleven_turbo_v2",
            "eleven_turbo_v2_5",
            "tts-1",
            "tts-1-hd",
            "whisper-1",
            // Pinning the snapshot instead of the unversioned alias is the other
            // way to end up on a dead model: this one shut down 2026-07-23 while
            // bare `gpt-4o-mini-tts` rolled forward to -2025-12-15.
            "gpt-4o-mini-tts-2025-03-20",
            "gpt-4o-mini-transcribe-2025-03-20",
        ];
        for id in RETIRED {
            assert_ne!(
                ELEVENLABS_DEFAULT_MODEL, *id,
                "ElevenLabs default is a retired model: {id}"
            );
            assert_ne!(
                OPENAI_DEFAULT_TTS_MODEL, *id,
                "OpenAI TTS default is a retired model: {id}"
            );
        }
    }

    /// The retired-list check above only catches ids someone remembered to add
    /// to it. This one catches the general case for the provider the catalog
    /// actually covers: `OPENAI_DEFAULT_TTS_MODEL` must still be a canonical
    /// OpenAI model key in the generated registry. If the id is renamed, or
    /// dropped from `models.json` when OpenAI finally retires the family, this
    /// fails instead of shipping a desktop default that no other surface —
    /// pricing, capability checks, the licence page — has ever heard of.
    ///
    /// ElevenLabs is deliberately not asserted: the catalog carries no
    /// ElevenLabs provider, so there is nothing to check against. See the
    /// comment on `ELEVENLABS_DEFAULT_MODEL`.
    #[test]
    fn openai_default_is_a_canonical_registry_model() {
        let keys = agiworkforce_model_registry::model_keys_for_provider("openai")
            .expect("generated model registry must load")
            .expect("the canonical registry must carry an openai provider");
        assert!(
            keys.iter().any(|key| key == OPENAI_DEFAULT_TTS_MODEL),
            "OPENAI_DEFAULT_TTS_MODEL ({OPENAI_DEFAULT_TTS_MODEL}) is not an openai key in the \
             canonical model registry; openai keys are {keys:?}"
        );
    }

    /// The defaults have to survive the config plumbing, not just exist as
    /// constants — this is the path a user with no voice settings takes.
    #[test]
    fn unconfigured_providers_fall_back_to_the_current_models() {
        let eleven = ElevenLabsTts::new(TtsConfig {
            provider: TtsProvider::ElevenLabs,
            api_key: Some("test".into()),
            voice_id: None,
            model_id: None,
        });
        assert_eq!(eleven.model_id(), ELEVENLABS_DEFAULT_MODEL);

        let openai = OpenAiTts::new(TtsConfig {
            provider: TtsProvider::OpenAi,
            api_key: Some("test".into()),
            voice_id: None,
            model_id: None,
        });
        assert_eq!(openai.model(), OPENAI_DEFAULT_TTS_MODEL);
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

    #[test]
    fn test_tts_player_initial_state() {
        let player = TtsPlayer::from_config(TtsConfig::default());
        assert!(!player.is_playing());
        assert!(player.current_text().is_none());
        assert_eq!(player.elapsed_ms(), 0);
    }
}
