/**
 * Voice Input with Whisper API
 * Speech-to-text for voice commands and dictation
 */
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

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
    OpenAI,    // Whisper API
    WebSpeech, // Browser Web Speech API
    Local,     // Local Whisper model (future)
}

pub struct VoiceState {
    pub settings: Arc<Mutex<VoiceSettings>>,
    pub client: Client,
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
        }
    }
}

impl Default for VoiceState {
    fn default() -> Self {
        Self::new()
    }
}

/// Transcribe audio file using Whisper API
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

/// Transcribe audio blob (for real-time recording)
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

    // Save blob to temporary file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("voice_{}.{}", uuid::Uuid::new_v4(), format));

    std::fs::write(&temp_file, audio_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Transcribe the temp file
    let result = voice_transcribe_file(temp_file.clone(), state).await;

    // Clean up temp file
    let _ = std::fs::remove_file(temp_file);

    result
}

/// Configure voice input settings
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

/// Get current voice settings
#[tauri::command]
pub async fn voice_get_settings(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<VoiceSettings, String> {
    let voice_state = state.lock().await;
    let settings = voice_state.settings.lock().await;
    Ok(settings.clone())
}

/// Start voice recording (handled by frontend, this is a placeholder)
#[tauri::command]
pub async fn voice_start_recording() -> Result<String, String> {
    tracing::info!("Voice recording started (handled by frontend)");
    Ok("recording".to_string())
}

/// Stop voice recording (handled by frontend, this is a placeholder)
#[tauri::command]
pub async fn voice_stop_recording() -> Result<(), String> {
    tracing::info!("Voice recording stopped (handled by frontend)");
    Ok(())
}

// Helper functions

async fn transcribe_with_openai(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
    client: &Client,
) -> Result<VoiceTranscription, String> {
    let api_key = settings
        .openai_api_key
        .as_ref()
        .ok_or("OpenAI API key not configured")?;

    // Read audio file
    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Get file extension
    let extension = audio_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3");

    // Build multipart form
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

    // Send request to Whisper API
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
        confidence: None, // Whisper API doesn't provide confidence scores
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
