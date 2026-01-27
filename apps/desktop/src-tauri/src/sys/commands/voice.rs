//! Tauri commands for voice functionality (transcription, TTS, wake word, PTT)

use crate::features::speech::{
    create_tts_provider, PttConfig, PushToTalk, TtsConfig, TtsProvider, Voice, VoiceWake,
    WakeWordConfig,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::{Mutex, RwLock};

// =============================================================================
// Transcription Types and State
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceTranscription {
    pub text: String,
    pub language: Option<String>,
    pub duration: Option<f32>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceSettings {
    pub provider: VoiceProvider,
    pub openai_api_key: Option<String>,
    pub model: String,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VoiceProvider {
    OpenAI,
    WebSpeech,
    Local,
}

pub struct VoiceState {
    pub settings: Arc<Mutex<VoiceSettings>>,
    pub client: Client,
    pub tts_config: Arc<RwLock<TtsConfig>>,
    pub wake: Arc<RwLock<VoiceWake>>,
    pub ptt: Arc<RwLock<PushToTalk>>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(VoiceSettings {
                provider: VoiceProvider::OpenAI,
                openai_api_key: None,
                model: "whisper-1".to_string(),
                language: None,
            })),
            client: Client::new(),
            tts_config: Arc::new(RwLock::new(TtsConfig::default())),
            wake: Arc::new(RwLock::new(VoiceWake::default())),
            ptt: Arc::new(RwLock::new(PushToTalk::default())),
        }
    }
}

impl Default for VoiceState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceCapabilities {
    pub tts_available: bool,
    pub tts_provider: String,
    pub wake_word_enabled: bool,
    pub ptt_enabled: bool,
    pub ptt_hotkey: String,
}

// =============================================================================
// Transcription Commands
// =============================================================================

#[tauri::command]
pub async fn voice_transcribe_file(
    audio_path: PathBuf,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceTranscription, String> {
    tracing::info!("Transcribing audio file: {:?}", audio_path);

    let voice_state = state.lock().await;
    let settings = voice_state.settings.lock().await;

    match settings.provider {
        VoiceProvider::OpenAI => {
            transcribe_with_openai(&audio_path, &settings, &voice_state.client).await
        }
        VoiceProvider::WebSpeech => {
            Err("Web Speech API transcription must be done from frontend".to_string())
        }
        VoiceProvider::Local => Err("Local Whisper model not yet implemented".to_string()),
    }
}

#[tauri::command]
pub async fn voice_transcribe_blob(
    audio_data: Vec<u8>,
    format: String,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceTranscription, String> {
    tracing::info!(
        "Transcribing audio blob ({} bytes, format: {})",
        audio_data.len(),
        format
    );

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("voice_{}.{}", uuid::Uuid::new_v4(), format));

    std::fs::write(&temp_file, audio_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let result = voice_transcribe_file(temp_file.clone(), state).await;

    let _ = std::fs::remove_file(temp_file);

    result
}

#[tauri::command]
pub async fn voice_configure(
    provider: String,
    api_key: Option<String>,
    model: Option<String>,
    language: Option<String>,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    tracing::info!("Configuring voice input: provider={}", provider);

    let voice_state = state.lock().await;
    let mut settings = voice_state.settings.lock().await;

    settings.provider = match provider.as_str() {
        "openai" => VoiceProvider::OpenAI,
        "webspeech" => VoiceProvider::WebSpeech,
        "local" => VoiceProvider::Local,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    if let Some(key) = api_key {
        settings.openai_api_key = Some(key);
    }

    if let Some(m) = model {
        settings.model = m;
    }

    if let Some(lang) = language {
        settings.language = Some(lang);
    }

    Ok(())
}

#[tauri::command]
pub async fn voice_get_settings(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceSettings, String> {
    let voice_state = state.lock().await;
    let settings = voice_state.settings.lock().await;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn voice_start_recording() -> Result<String, String> {
    tracing::info!("Voice recording started (handled by frontend)");
    Ok("recording".to_string())
}

#[tauri::command]
pub async fn voice_stop_recording() -> Result<(), String> {
    tracing::info!("Voice recording stopped (handled by frontend)");
    Ok(())
}

#[tauri::command]
pub async fn voice_check_local_whisper() -> Result<bool, String> {
    // Check if local Whisper model is available
    // This checks for common whisper.cpp paths
    let possible_paths = ["/usr/local/bin/whisper", "/usr/bin/whisper"];

    for path in &possible_paths {
        if std::path::Path::new(path).exists() {
            return Ok(true);
        }
    }

    // Check home directory paths
    if let Some(home) = dirs::home_dir() {
        let home_whisper = home.join(".local/bin/whisper");
        if home_whisper.exists() {
            return Ok(true);
        }
    }

    // Also check if whisper is in PATH
    if which::which("whisper").is_ok() {
        return Ok(true);
    }

    Ok(false)
}

async fn transcribe_with_openai(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
    client: &Client,
) -> Result<VoiceTranscription, String> {
    let api_key = settings
        .openai_api_key
        .as_ref()
        .ok_or("OpenAI API key not configured")?;

    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    let extension = audio_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3");

    let file_part = reqwest::multipart::Part::bytes(audio_data)
        .file_name(format!("audio.{}", extension))
        .mime_str(&format!("audio/{}", extension))
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", settings.model.clone());

    if let Some(ref lang) = settings.language {
        form = form.text("language", lang.clone());
    }

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Whisper API error: {}", error_text));
    }

    let whisper_response: WhisperResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(VoiceTranscription {
        text: whisper_response.text,
        language: whisper_response.language,
        duration: whisper_response.duration,
        confidence: None,
    })
}

#[derive(Debug, Deserialize)]
struct WhisperResponse {
    text: String,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    duration: Option<f32>,
}

// =============================================================================
// TTS Commands
// =============================================================================

/// Get voice capabilities
#[tauri::command]
pub async fn voice_get_capabilities(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceCapabilities, String> {
    let voice_state = state.lock().await;
    let tts_config = voice_state.tts_config.read().await;
    let wake = voice_state.wake.read().await;
    let ptt = voice_state.ptt.read().await;

    Ok(VoiceCapabilities {
        tts_available: tts_config.api_key.is_some()
            || matches!(tts_config.provider, TtsProvider::System),
        tts_provider: format!("{:?}", tts_config.provider),
        wake_word_enabled: wake.get_config().enabled,
        ptt_enabled: ptt.get_config().enabled,
        ptt_hotkey: ptt.get_config().hotkey.clone(),
    })
}

/// Speak text using TTS
#[tauri::command]
pub async fn voice_tts_speak(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    text: String,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let config = voice_state.tts_config.read().await.clone();
    let provider = create_tts_provider(config);

    provider
        .synthesize(&text)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// List available TTS voices
#[tauri::command]
pub async fn voice_tts_list_voices(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Vec<Voice>, String> {
    let voice_state = state.lock().await;
    let config = voice_state.tts_config.read().await.clone();
    let provider = create_tts_provider(config);

    provider.list_voices().await.map_err(|e| e.to_string())
}

/// Configure TTS
#[tauri::command]
pub async fn voice_tts_configure(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: TtsConfig,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut current = voice_state.tts_config.write().await;
    *current = config;
    Ok(())
}

// =============================================================================
// Wake Word Commands
// =============================================================================

/// Enable wake word detection
#[tauri::command]
pub async fn voice_wake_enable(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: Option<WakeWordConfig>,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut wake = voice_state.wake.write().await;

    if let Some(cfg) = config {
        wake.update_config(cfg);
    }

    wake.start().await.map(|_| ()).map_err(|e| e.to_string())
}

/// Disable wake word detection
#[tauri::command]
pub async fn voice_wake_disable(state: State<'_, Arc<Mutex<VoiceState>>>) -> Result<(), String> {
    let voice_state = state.lock().await;
    let wake = voice_state.wake.read().await;
    wake.stop();
    Ok(())
}

/// Get wake word status
#[tauri::command]
pub async fn voice_wake_status(state: State<'_, Arc<Mutex<VoiceState>>>) -> Result<bool, String> {
    let voice_state = state.lock().await;
    let wake = voice_state.wake.read().await;
    Ok(wake.is_listening())
}

/// Configure wake word
#[tauri::command]
pub async fn voice_wake_configure(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: WakeWordConfig,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut wake = voice_state.wake.write().await;
    wake.update_config(config);
    Ok(())
}

// =============================================================================
// Push-to-Talk Commands
// =============================================================================

/// Configure push-to-talk
#[tauri::command]
pub async fn voice_ptt_configure(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: PttConfig,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut ptt = voice_state.ptt.write().await;
    ptt.update_config(config);
    Ok(())
}

/// Get PTT state
#[tauri::command]
pub async fn voice_ptt_state(state: State<'_, Arc<Mutex<VoiceState>>>) -> Result<String, String> {
    let voice_state = state.lock().await;
    let ptt = voice_state.ptt.read().await;
    Ok(format!("{:?}", ptt.get_state()))
}

/// Handle PTT key down
#[tauri::command]
pub async fn voice_ptt_key_down(state: State<'_, Arc<Mutex<VoiceState>>>) -> Result<(), String> {
    let voice_state = state.lock().await;
    let ptt = voice_state.ptt.read().await;
    ptt.key_down().await.map_err(|e| e.to_string())
}

/// Handle PTT key up
#[tauri::command]
pub async fn voice_ptt_key_up(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Option<usize>, String> {
    let voice_state = state.lock().await;
    let ptt = voice_state.ptt.read().await;
    ptt.key_up()
        .await
        .map(|audio| audio.map(|a| a.len()))
        .map_err(|e| e.to_string())
}
