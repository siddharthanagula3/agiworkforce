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

/// Event emitted when TTS playback state changes.
///
/// Failures are NOT a variant here — they leave through `Err`, so a caller
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

/// TTS trait for different providers
#[async_trait]
pub trait TextToSpeech: Send + Sync {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput>;
    async fn list_voices(&self) -> Result<Vec<Voice>>;
    fn provider_name(&self) -> &'static str;
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

        let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);

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

/// The voices `SystemTts` can actually speak with on a build whose platform
/// support is `platform_supported`.
///
/// A voice entry the build cannot speak with is placeholder data. This used to
/// return "System Default" unconditionally, so the Windows and Linux builds —
/// where `SystemTts::speak_sync` is unimplemented — advertised a selectable
/// voice whose only behaviour was to fail. Split out from `list_voices` so both
/// branches are testable from any host, not only from the platform under test.
fn system_voice_catalog(platform_supported: bool) -> Vec<Voice> {
    if !platform_supported {
        return Vec::new();
    }

    vec![Voice {
        id: "system-default".to_string(),
        name: "System Default".to_string(),
        preview_url: None,
        category: Some("system".to_string()),
    }]
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
    /// Only the macOS arm of `speak_sync` is implemented — every other target
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
        Ok(system_voice_catalog(Self::platform_supported()))
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

        // A synthesis failure must leave as a failure. This used to return
        // `Ok(TtsPlaybackEvent::Error { .. })`, and nothing anywhere inspected
        // the returned variant: `voice_tts_speak_with_barge_in` took its `Ok`
        // arm, emitted `voice:tts_completed`, and resolved the promise. On
        // Windows and Linux — where `SystemTts` cannot speak at all — the user
        // heard nothing while every layer above reported success, including the
        // browser-TTS fallback in `useTTS.speakWithBargeIn`, which is wired to
        // a rejected promise and so never ran.
        result.map(|_| TtsPlaybackEvent::Completed {
            text: text.to_string(),
            duration_ms,
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

    /// The Windows/Linux defect, reproducible from any host: `list_voices` used
    /// to hand back "System Default" unconditionally, so a build that cannot
    /// speak still offered a selectable voice.
    #[test]
    fn system_voice_catalog_is_empty_where_the_platform_cannot_speak() {
        assert!(
            system_voice_catalog(false).is_empty(),
            "a build with no implemented speak arm must not advertise a voice"
        );
    }

    #[test]
    fn system_voice_catalog_offers_the_default_voice_where_the_platform_can_speak() {
        let voices = system_voice_catalog(true);
        assert_eq!(voices.len(), 1);
        assert_eq!(voices[0].id, "system-default");
    }

    /// `platform_supported()` must track the ONLY arm of `speak_sync` that is
    /// implemented. Asserted from the unsupported side, which is where the
    /// capability lie lived — on macOS this only pins the constant, without
    /// spawning `say` into a test run.
    #[test]
    fn system_tts_platform_support_matches_the_implemented_speak_arm() {
        if SystemTts::platform_supported() {
            assert!(
                cfg!(target_os = "macos"),
                "only macOS implements speak_sync"
            );
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

    /// End-to-end through the trait the Tauri command actually calls.
    #[tokio::test]
    async fn list_voices_never_offers_a_voice_the_build_cannot_speak_with() {
        let voices = SystemTts::new().list_voices().await.unwrap();
        assert_eq!(
            voices.is_empty(),
            !SystemTts::platform_supported(),
            "list_voices must agree with platform support, got: {:?}",
            voices.iter().map(|v| &v.id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_tts_player_initial_state() {
        let player = TtsPlayer::from_config(TtsConfig::default());
        assert!(!player.is_playing());
        assert!(player.current_text().is_none());
        assert_eq!(player.elapsed_ms(), 0);
    }

    /// A provider that cannot speak — stands in for `SystemTts` on Windows and
    /// Linux, and for a network provider that is down.
    struct FailingTts;

    #[async_trait]
    impl TextToSpeech for FailingTts {
        async fn synthesize(&self, _text: &str) -> Result<AudioOutput> {
            Err(Error::Generic(
                "System TTS not implemented for this platform".into(),
            ))
        }
        async fn list_voices(&self) -> Result<Vec<Voice>> {
            Ok(Vec::new())
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
        async fn list_voices(&self) -> Result<Vec<Voice>> {
            Ok(Vec::new())
        }
        fn provider_name(&self) -> &'static str {
            "silent-ok"
        }
    }

    /// THE regression. `speak` used to wrap a synthesis failure as
    /// `Ok(TtsPlaybackEvent::Error { .. })`, which `voice_tts_speak_with_barge_in`
    /// read as its success arm — it emitted `voice:tts_completed` and resolved
    /// the promise, so the frontend's catch-based fallback to browser TTS never
    /// ran and the user got silence reported as success.
    #[tokio::test]
    async fn speak_surfaces_a_synthesis_failure_as_an_error() {
        let player = TtsPlayer::new(Box::new(FailingTts));
        let err = player
            .speak("hello")
            .await
            .err()
            .expect("a provider that cannot synthesize must not report playback");
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
}
