//! Text-to-speech integration

use crate::sys::error::{Error, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

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

/// TTS trait for different providers
#[async_trait]
pub trait TextToSpeech: Send + Sync {
    async fn synthesize(&self, text: &str) -> Result<AudioOutput>;
    async fn list_voices(&self) -> Result<Vec<Voice>>;
    fn provider_name(&self) -> &'static str;
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

    fn model_id(&self) -> &str {
        self.config
            .model_id
            .as_deref()
            .unwrap_or("eleven_monolingual_v1")
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

/// System TTS (uses OS native TTS)
pub struct SystemTts;

impl SystemTts {
    pub fn new() -> Self {
        Self
    }

    /// Speak text using system TTS (macOS say command, etc.)
    pub fn speak_sync(&self, text: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("say")
                .arg(text)
                .spawn()
                .map_err(|e| Error::Generic(format!("TTS error: {}", e)))?;
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
        TtsProvider::OpenAi => Box::new(ElevenLabsTts::new(config)), // Fallback for now
        TtsProvider::System => Box::new(SystemTts::new()),
    }
}
