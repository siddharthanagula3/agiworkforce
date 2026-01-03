use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
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
    OpenAI,
    WebSpeech,
    Local,
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
        VoiceProvider::Local => transcribe_with_local_whisper(&audio_path, &settings).await,
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

/// Local Whisper transcription using whisper.cpp CLI or Python whisper
/// Falls back to available local whisper implementation
async fn transcribe_with_local_whisper(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
) -> Result<VoiceTranscription, String> {
    tracing::info!(
        "Attempting local Whisper transcription for: {:?}",
        audio_path
    );

    // Determine model size from settings (default to "base" for speed)
    let model_size = if settings.model.contains("large") {
        "large"
    } else if settings.model.contains("medium") {
        "medium"
    } else if settings.model.contains("small") {
        "small"
    } else if settings.model.contains("tiny") {
        "tiny"
    } else {
        "base"
    };

    // Try whisper.cpp first (faster, C++ implementation)
    if let Ok(result) = try_whisper_cpp(audio_path, model_size, settings.language.as_deref()).await
    {
        return Ok(result);
    }

    // Fall back to Python whisper CLI
    if let Ok(result) =
        try_python_whisper(audio_path, model_size, settings.language.as_deref()).await
    {
        return Ok(result);
    }

    // Fall back to mlx-whisper (Apple Silicon optimized)
    if let Ok(result) = try_mlx_whisper(audio_path, model_size, settings.language.as_deref()).await
    {
        return Ok(result);
    }

    Err("Local Whisper not available. Install one of:\n\
         - whisper.cpp: brew install whisper-cpp\n\
         - Python whisper: pip install openai-whisper\n\
         - MLX whisper: pip install mlx-whisper (Apple Silicon)"
        .to_string())
}

/// Try whisper.cpp CLI
async fn try_whisper_cpp(
    audio_path: &PathBuf,
    model: &str,
    language: Option<&str>,
) -> Result<VoiceTranscription, String> {
    let mut cmd = Command::new("whisper-cpp");
    cmd.arg("-m")
        .arg(format!("ggml-{}.bin", model))
        .arg("-f")
        .arg(audio_path)
        .arg("--output-txt")
        .arg("--no-timestamps");

    if let Some(lang) = language {
        cmd.arg("-l").arg(lang);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("whisper-cpp not found: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "whisper-cpp failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(VoiceTranscription {
        text,
        language: language.map(|s| s.to_string()),
        duration: None,
        confidence: Some(0.9), // Local models don't provide confidence
    })
}

/// Try Python OpenAI Whisper CLI
async fn try_python_whisper(
    audio_path: &PathBuf,
    model: &str,
    language: Option<&str>,
) -> Result<VoiceTranscription, String> {
    let mut cmd = Command::new("whisper");
    cmd.arg(audio_path)
        .arg("--model")
        .arg(model)
        .arg("--output_format")
        .arg("txt");

    if let Some(lang) = language {
        cmd.arg("--language").arg(lang);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Python whisper not found: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Python whisper failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Python whisper outputs to a .txt file with same name
    let txt_path = audio_path.with_extension("txt");
    let text = std::fs::read_to_string(&txt_path)
        .map_err(|e| format!("Failed to read whisper output: {}", e))?;

    // Clean up the output file
    let _ = std::fs::remove_file(txt_path);

    Ok(VoiceTranscription {
        text: text.trim().to_string(),
        language: language.map(|s| s.to_string()),
        duration: None,
        confidence: Some(0.9),
    })
}

/// Try MLX Whisper (Apple Silicon optimized)
async fn try_mlx_whisper(
    audio_path: &PathBuf,
    model: &str,
    language: Option<&str>,
) -> Result<VoiceTranscription, String> {
    let mut cmd = Command::new("mlx_whisper");
    cmd.arg(audio_path)
        .arg("--model")
        .arg(format!("mlx-community/whisper-{}-mlx", model));

    if let Some(lang) = language {
        cmd.arg("--language").arg(lang);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("mlx_whisper not found: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "mlx_whisper failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(VoiceTranscription {
        text,
        language: language.map(|s| s.to_string()),
        duration: None,
        confidence: Some(0.9),
    })
}

#[tauri::command]
pub async fn voice_check_local_whisper() -> Result<Vec<String>, String> {
    let mut available = Vec::new();

    // Check whisper.cpp
    if Command::new("whisper-cpp")
        .arg("--help")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        available.push("whisper-cpp".to_string());
    }

    // Check Python whisper
    if Command::new("whisper")
        .arg("--help")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        available.push("python-whisper".to_string());
    }

    // Check MLX whisper
    if Command::new("mlx_whisper")
        .arg("--help")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        available.push("mlx-whisper".to_string());
    }

    Ok(available)
}
