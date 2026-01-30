//! Tauri commands for voice functionality (transcription, TTS, wake word, PTT, barge-in, Deepgram STT)
//!
//! Includes local offline fallback with Whisper.cpp for STT and Piper for TTS.

use crate::features::speech::{
    create_tts_provider, BargeInConfig, BargeInHandle, BargeInStats, DeepgramConfig, DeepgramState,
    DeepgramStreamingStats, PiperLocal, PiperVoiceDefinitions, PiperVoiceInfo, PttConfig,
    PushToTalk, SynthesisConfig, TranscriptionConfig, TtsConfig, TtsInterruptReason, TtsPlayer,
    TtsProvider, Voice, VoiceWake, WakeWordConfig, WhisperLocal, WhisperModelInfo,
    WhisperModelSize,
};
#[cfg(feature = "vad")]
use crate::features::speech::{BargeInDetector, SharedVad};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
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

/// Barge-in detection state
pub struct BargeInState {
    /// Barge-in detector instance
    #[cfg(feature = "vad")]
    pub detector: Option<BargeInDetector>,
    /// Active monitoring handle
    pub handle: Option<BargeInHandle>,
    /// Configuration
    pub config: BargeInConfig,
    /// Whether barge-in is enabled
    pub enabled: bool,
}

impl Default for BargeInState {
    fn default() -> Self {
        Self {
            #[cfg(feature = "vad")]
            detector: None,
            handle: None,
            config: BargeInConfig::default(),
            enabled: false,
        }
    }
}

/// State for local Whisper STT
pub struct LocalWhisperState {
    /// Whisper instance (lazy loaded)
    pub whisper: Option<WhisperLocal>,
    /// Selected model size
    pub model_size: WhisperModelSize,
    /// Models directory
    pub models_dir: PathBuf,
}

impl Default for LocalWhisperState {
    fn default() -> Self {
        let models_dir = WhisperLocal::default_models_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("whisper"));
        Self {
            whisper: None,
            model_size: WhisperModelSize::Base,
            models_dir,
        }
    }
}

/// State for local Piper TTS
pub struct LocalPiperState {
    /// Piper instance (lazy loaded)
    pub piper: Option<PiperLocal>,
    /// Selected voice ID
    pub voice_id: String,
    /// Models directory
    pub models_dir: PathBuf,
}

impl Default for LocalPiperState {
    fn default() -> Self {
        let models_dir =
            PiperLocal::default_models_dir().unwrap_or_else(|_| std::env::temp_dir().join("piper"));
        Self {
            piper: None,
            voice_id: "en_US-lessac-medium".to_string(),
            models_dir,
        }
    }
}

pub struct VoiceState {
    pub settings: Arc<Mutex<VoiceSettings>>,
    pub client: Client,
    pub tts_config: Arc<RwLock<TtsConfig>>,
    pub tts_player: Arc<RwLock<Option<TtsPlayer>>>,
    pub wake: Arc<RwLock<VoiceWake>>,
    pub ptt: Arc<RwLock<PushToTalk>>,
    pub barge_in: Arc<RwLock<BargeInState>>,
    pub deepgram: Arc<RwLock<DeepgramState>>,
    #[cfg(feature = "vad")]
    pub vad: Arc<RwLock<Option<SharedVad>>>,
    /// Local Whisper STT state
    pub local_whisper: Arc<RwLock<LocalWhisperState>>,
    /// Local Piper TTS state
    pub local_piper: Arc<RwLock<LocalPiperState>>,
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
            tts_player: Arc::new(RwLock::new(None)),
            wake: Arc::new(RwLock::new(VoiceWake::default())),
            ptt: Arc::new(RwLock::new(PushToTalk::default())),
            barge_in: Arc::new(RwLock::new(BargeInState::default())),
            deepgram: Arc::new(RwLock::new(DeepgramState::new())),
            #[cfg(feature = "vad")]
            vad: Arc::new(RwLock::new(None)),
            local_whisper: Arc::new(RwLock::new(LocalWhisperState::default())),
            local_piper: Arc::new(RwLock::new(LocalPiperState::default())),
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
    pub tts_playing: bool,
    pub wake_word_enabled: bool,
    pub ptt_enabled: bool,
    pub ptt_hotkey: String,
    pub barge_in_enabled: bool,
    pub barge_in_sensitivity: f32,
    pub vad_available: bool,
    /// Whether local Whisper STT is available (model downloaded)
    pub local_stt_available: bool,
    /// Current local Whisper model size
    pub local_stt_model: Option<String>,
    /// Whether local Piper TTS is available (voice downloaded)
    pub local_tts_available: bool,
    /// Current local Piper voice ID
    pub local_tts_voice: Option<String>,
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
        VoiceProvider::Local => {
            // Use local Whisper
            let local_whisper = voice_state.local_whisper.read().await;
            transcribe_with_local_whisper(&audio_path, &local_whisper, settings.language.clone())
                .await
        }
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

/// Transcribe using local Whisper model
async fn transcribe_with_local_whisper(
    audio_path: &PathBuf,
    local_state: &LocalWhisperState,
    language: Option<String>,
) -> Result<VoiceTranscription, String> {
    // Check if model exists
    let model_path = local_state
        .models_dir
        .join(local_state.model_size.model_filename());
    if !model_path.exists() {
        return Err(format!(
            "Local Whisper model not found. Please download the {} model first.",
            local_state.model_size
        ));
    }

    // Read audio file and convert to f32 samples
    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Decode audio to PCM f32 samples
    // For simplicity, we expect WAV files here. In production, consider using symphonia for multiple formats.
    let (samples, sample_rate) = decode_audio_to_samples(&audio_data)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Create Whisper instance
    let whisper = WhisperLocal::new(model_path, local_state.model_size)
        .map_err(|e| format!("Failed to initialize Whisper: {}", e))?;

    // Configure transcription
    let config = TranscriptionConfig {
        language,
        translate_to_english: false,
        num_threads: 0, // auto
        word_timestamps: false,
        max_segment_length: None,
    };

    // Run transcription
    let result = whisper
        .transcribe(&samples, sample_rate, Some(config))
        .await
        .map_err(|e| format!("Transcription failed: {}", e))?;

    Ok(VoiceTranscription {
        text: result.text,
        language: result.language,
        duration: result.duration_seconds,
        confidence: result.confidence,
    })
}

/// Decode audio bytes to f32 samples
/// Currently supports WAV format. Can be extended with symphonia for more formats.
fn decode_audio_to_samples(audio_bytes: &[u8]) -> Result<(Vec<f32>, u32), String> {
    // Simple WAV decoder for PCM audio
    // WAV header structure: RIFF header (12 bytes), fmt chunk, data chunk

    if audio_bytes.len() < 44 {
        return Err("Audio file too short to be valid WAV".to_string());
    }

    // Check RIFF header
    if &audio_bytes[0..4] != b"RIFF" || &audio_bytes[8..12] != b"WAVE" {
        return Err("Not a valid WAV file. Please convert your audio to WAV format.".to_string());
    }

    // Parse fmt chunk
    let mut pos = 12;
    let mut sample_rate = 16000u32;
    let mut bits_per_sample = 16u16;
    let mut num_channels = 1u16;

    while pos + 8 <= audio_bytes.len() {
        let chunk_id = &audio_bytes[pos..pos + 4];
        let chunk_size = u32::from_le_bytes([
            audio_bytes[pos + 4],
            audio_bytes[pos + 5],
            audio_bytes[pos + 6],
            audio_bytes[pos + 7],
        ]) as usize;

        if chunk_id == b"fmt " {
            if chunk_size >= 16 {
                num_channels = u16::from_le_bytes([audio_bytes[pos + 10], audio_bytes[pos + 11]]);
                sample_rate = u32::from_le_bytes([
                    audio_bytes[pos + 12],
                    audio_bytes[pos + 13],
                    audio_bytes[pos + 14],
                    audio_bytes[pos + 15],
                ]);
                bits_per_sample =
                    u16::from_le_bytes([audio_bytes[pos + 22], audio_bytes[pos + 23]]);
            }
        } else if chunk_id == b"data" {
            let data_start = pos + 8;
            let data_end = (data_start + chunk_size).min(audio_bytes.len());
            let audio_data = &audio_bytes[data_start..data_end];

            // Convert to f32 samples
            let samples: Vec<f32> = match bits_per_sample {
                16 => audio_data
                    .chunks_exact(2)
                    .map(|chunk| {
                        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                        sample as f32 / 32768.0
                    })
                    .collect(),
                8 => audio_data
                    .iter()
                    .map(|&b| (b as f32 - 128.0) / 128.0)
                    .collect(),
                32 => audio_data
                    .chunks_exact(4)
                    .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                    .collect(),
                _ => return Err(format!("Unsupported bits per sample: {}", bits_per_sample)),
            };

            // Convert to mono if stereo
            let mono_samples = if num_channels > 1 {
                samples
                    .chunks(num_channels as usize)
                    .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
                    .collect()
            } else {
                samples
            };

            return Ok((mono_samples, sample_rate));
        }

        pos += 8 + chunk_size;
        // Align to word boundary
        if chunk_size % 2 == 1 && pos < audio_bytes.len() {
            pos += 1;
        }
    }

    Err("No audio data found in WAV file".to_string())
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
    let tts_player = voice_state.tts_player.read().await;
    let wake = voice_state.wake.read().await;
    let ptt = voice_state.ptt.read().await;
    let barge_in = voice_state.barge_in.read().await;
    let local_whisper = voice_state.local_whisper.read().await;
    let local_piper = voice_state.local_piper.read().await;

    let tts_playing = tts_player.as_ref().map(|p| p.is_playing()).unwrap_or(false);

    // Check if local whisper model is available
    let whisper_model_path = local_whisper
        .models_dir
        .join(local_whisper.model_size.model_filename());
    let local_stt_available = whisper_model_path.exists();

    // Check if local piper voice is available
    let piper_model_path = local_piper
        .models_dir
        .join(format!("{}.onnx", local_piper.voice_id));
    let local_tts_available = piper_model_path.exists();

    Ok(VoiceCapabilities {
        tts_available: tts_config.api_key.is_some()
            || matches!(tts_config.provider, TtsProvider::System),
        tts_provider: format!("{:?}", tts_config.provider),
        tts_playing,
        wake_word_enabled: wake.get_config().enabled,
        ptt_enabled: ptt.get_config().enabled,
        ptt_hotkey: ptt.get_config().hotkey.clone(),
        barge_in_enabled: barge_in.enabled,
        barge_in_sensitivity: barge_in.config.sensitivity,
        vad_available: cfg!(feature = "vad"),
        local_stt_available,
        local_stt_model: if local_stt_available {
            Some(local_whisper.model_size.to_string())
        } else {
            None
        },
        local_tts_available,
        local_tts_voice: if local_tts_available {
            Some(local_piper.voice_id.clone())
        } else {
            None
        },
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

// =============================================================================
// Deepgram Streaming STT Commands
// =============================================================================

/// Deepgram streaming status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepgramStreamStatus {
    /// Whether streaming is currently active
    pub is_streaming: bool,
    /// Current connection state
    pub connection_state: String,
    /// Statistics (if streaming)
    pub stats: Option<DeepgramStreamingStats>,
}

/// Configure Deepgram streaming settings
///
/// This must be called before starting a stream to set the API key and options.
#[tauri::command]
pub async fn voice_deepgram_configure(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: DeepgramConfig,
) -> Result<(), String> {
    tracing::info!("Configuring Deepgram with model: {}", config.model);

    let voice_state = state.lock().await;
    let deepgram = voice_state.deepgram.write().await;
    deepgram.initialize(config).await;

    Ok(())
}

/// Start Deepgram streaming transcription
///
/// This starts a WebSocket connection to Deepgram and begins accepting audio.
/// Transcripts will be emitted as Tauri events: `deepgram:transcript`
#[tauri::command]
pub async fn voice_start_deepgram_stream(
    app: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    tracing::info!("Starting Deepgram streaming transcription");

    let voice_state = state.lock().await;
    let deepgram = voice_state.deepgram.read().await;

    // Start streaming
    deepgram.start().await.map_err(|e| {
        let msg = e.to_string();
        tracing::error!("Failed to start Deepgram stream: {}", msg);
        // Translate to user-friendly message
        if msg.contains("API key") {
            "Deepgram API key not configured. Please add your Deepgram API key in Voice settings."
                .to_string()
        } else if msg.contains("already active") {
            "A streaming session is already active. Stop it first before starting a new one."
                .to_string()
        } else {
            format!("Could not start voice transcription: {}", msg)
        }
    })?;

    // Spawn a task to forward transcripts as Tauri events
    let deepgram_clone = voice_state.deepgram.clone();
    tokio::spawn(async move {
        loop {
            let deepgram_guard = deepgram_clone.read().await;
            if let Some(event) = deepgram_guard.receive_transcript().await {
                // Emit transcript event to frontend
                if let Err(e) = app.emit("deepgram:transcript", &event) {
                    tracing::error!("Failed to emit transcript event: {}", e);
                }

                // Also emit speech_final events separately for easier handling
                if event.speech_final {
                    if let Err(e) = app.emit("deepgram:speech_final", &event) {
                        tracing::error!("Failed to emit speech_final event: {}", e);
                    }
                }
            } else {
                // Channel closed, streaming stopped
                break;
            }
            drop(deepgram_guard);
        }
        tracing::debug!("Deepgram transcript forwarding task ended");
    });

    Ok(())
}

/// Stop Deepgram streaming transcription
///
/// This closes the WebSocket connection and stops accepting audio.
/// Returns the final streaming statistics.
#[tauri::command]
pub async fn voice_stop_deepgram_stream(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Option<DeepgramStreamingStats>, String> {
    tracing::info!("Stopping Deepgram streaming transcription");

    let voice_state = state.lock().await;
    let deepgram = voice_state.deepgram.read().await;

    // Get stats before stopping
    let stats = deepgram.get_stats().await;

    // Stop streaming
    deepgram.stop().await;

    Ok(stats)
}

/// Send audio data to the active Deepgram stream
///
/// Audio should be PCM 16-bit mono at 16kHz (or the configured sample rate).
/// Audio can be sent as raw bytes or base64 encoded.
#[tauri::command]
pub async fn voice_deepgram_send_audio(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    audio_data: Vec<u8>,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let deepgram = voice_state.deepgram.read().await;

    deepgram.send_audio(audio_data).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("not started") {
            "No active streaming session. Call voice_start_deepgram_stream first.".to_string()
        } else if msg.contains("channel closed") {
            "Streaming session was closed. Please restart the session.".to_string()
        } else {
            format!("Could not send audio: {}", msg)
        }
    })
}

/// Get the current status of Deepgram streaming
#[tauri::command]
pub async fn voice_deepgram_status(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<DeepgramStreamStatus, String> {
    let voice_state = state.lock().await;
    let deepgram = voice_state.deepgram.read().await;

    let is_streaming = deepgram.is_streaming().await;
    let stats = deepgram.get_stats().await;

    let connection_state = stats
        .as_ref()
        .map(|s| format!("{:?}", s.state))
        .unwrap_or_else(|| "Disconnected".to_string());

    Ok(DeepgramStreamStatus {
        is_streaming,
        connection_state,
        stats,
    })
}

/// Convert f32 audio samples to PCM 16-bit bytes for Deepgram
///
/// This is a utility function to convert floating-point audio samples
/// (like those from the VAD or microphone) to the format expected by Deepgram.
#[tauri::command]
pub fn voice_convert_audio_to_pcm(samples: Vec<f32>) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        // Clamp to [-1.0, 1.0] and convert to i16
        let clamped = sample.clamp(-1.0, 1.0);
        let i16_sample = (clamped * 32767.0) as i16;
        bytes.extend_from_slice(&i16_sample.to_le_bytes());
    }
    bytes
}

// =============================================================================
// Local Whisper STT Commands
// =============================================================================

/// Download progress event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub percentage: f32,
}

/// Download a Whisper model for local STT
///
/// Downloads the specified Whisper model from Hugging Face to the local models directory.
/// Emits `voice:whisper_download_progress` events during download.
#[tauri::command]
pub async fn voice_download_whisper_model(
    app: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
    model_size: String,
) -> Result<String, String> {
    let size: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();
    drop(voice_state);

    tracing::info!("Downloading Whisper {} model to {:?}", size, models_dir);

    let app_handle = app.clone();
    let model_path = WhisperLocal::download_model(size, models_dir, move |downloaded, total| {
        let progress = DownloadProgress {
            bytes_downloaded: downloaded,
            total_bytes: total,
            percentage: if total > 0 {
                (downloaded as f32 / total as f32) * 100.0
            } else {
                0.0
            },
        };
        let _ = app_handle.emit("voice:whisper_download_progress", progress);
    })
    .await
    .map_err(|e| format!("Failed to download Whisper model: {}", e))?;

    // Update state with new model
    let voice_state = state.lock().await;
    let mut local_whisper = voice_state.local_whisper.write().await;
    local_whisper.model_size = size;

    Ok(model_path.to_string_lossy().to_string())
}

/// List available Whisper models (both downloaded and available for download)
#[tauri::command]
pub async fn voice_list_whisper_models(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Vec<WhisperModelInfo>, String> {
    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();

    let models = vec![
        WhisperModelInfo::new(WhisperModelSize::Tiny, &models_dir),
        WhisperModelInfo::new(WhisperModelSize::Base, &models_dir),
        WhisperModelInfo::new(WhisperModelSize::Small, &models_dir),
        WhisperModelInfo::new(WhisperModelSize::Medium, &models_dir),
    ];

    Ok(models)
}

/// Set the active Whisper model size
#[tauri::command]
pub async fn voice_set_whisper_model(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    model_size: String,
) -> Result<(), String> {
    let size: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let mut local_whisper = voice_state.local_whisper.write().await;
    local_whisper.model_size = size;
    // Clear existing whisper instance so it will be reloaded with new model
    local_whisper.whisper = None;

    tracing::info!("Set local Whisper model to {}", size);
    Ok(())
}

/// Delete a downloaded Whisper model
#[tauri::command]
pub async fn voice_delete_whisper_model(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    model_size: String,
) -> Result<(), String> {
    let size: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();

    WhisperLocal::delete_model(&models_dir, size)
        .await
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    tracing::info!("Deleted Whisper {} model", size);
    Ok(())
}

/// Transcribe audio using local Whisper (bypasses provider selection)
#[tauri::command]
pub async fn voice_transcribe_local(
    audio_path: PathBuf,
    state: State<'_, Arc<Mutex<VoiceState>>>,
    language: Option<String>,
) -> Result<VoiceTranscription, String> {
    tracing::info!("Transcribing with local Whisper: {:?}", audio_path);

    let voice_state = state.lock().await;
    let local_whisper = voice_state.local_whisper.read().await;

    transcribe_with_local_whisper(&audio_path, &local_whisper, language).await
}

// =============================================================================
// Local Piper TTS Commands
// =============================================================================

/// Download a Piper voice for local TTS
///
/// Downloads the specified Piper voice from Hugging Face to the local models directory.
/// Emits `voice:piper_download_progress` events during download.
#[tauri::command]
pub async fn voice_download_piper_voice(
    app: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
    voice_id: String,
) -> Result<String, String> {
    let voice_state = state.lock().await;
    let models_dir = voice_state.local_piper.read().await.models_dir.clone();
    drop(voice_state);

    tracing::info!("Downloading Piper voice {} to {:?}", voice_id, models_dir);

    let app_handle = app.clone();
    let model_path = PiperLocal::download_voice(&voice_id, models_dir, move |downloaded, total| {
        let progress = DownloadProgress {
            bytes_downloaded: downloaded,
            total_bytes: total,
            percentage: if total > 0 {
                (downloaded as f32 / total as f32) * 100.0
            } else {
                0.0
            },
        };
        let _ = app_handle.emit("voice:piper_download_progress", progress);
    })
    .await
    .map_err(|e| format!("Failed to download Piper voice: {}", e))?;

    // Update state with new voice
    let voice_state = state.lock().await;
    let mut local_piper = voice_state.local_piper.write().await;
    local_piper.voice_id = voice_id;

    Ok(model_path.to_string_lossy().to_string())
}

/// List available Piper voices (both downloaded and available for download)
#[tauri::command]
pub async fn voice_list_piper_voices(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Vec<PiperVoiceInfo>, String> {
    let voice_state = state.lock().await;
    let local_piper = voice_state.local_piper.read().await;
    let models_dir = local_piper.models_dir.clone();

    // Get popular voices and mark which are downloaded
    let mut voices = PiperVoiceDefinitions::popular_voices();
    for voice in &mut voices {
        let model_path = models_dir.join(format!("{}.onnx", voice.id));
        voice.is_downloaded = model_path.exists();
        if voice.is_downloaded {
            voice.model_path = Some(model_path);
        }
    }

    // Also add any locally downloaded voices not in the popular list
    if let Some(piper) = &local_piper.piper {
        for local_voice in piper.list_available_voices() {
            if !voices.iter().any(|v| v.id == local_voice.id) {
                voices.push(local_voice);
            }
        }
    }

    Ok(voices)
}

/// Set the active Piper voice
#[tauri::command]
pub async fn voice_set_piper_voice(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    voice_id: String,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut local_piper = voice_state.local_piper.write().await;
    local_piper.voice_id = voice_id.clone();
    // Clear existing piper instance so it will be reloaded with new voice
    local_piper.piper = None;

    tracing::info!("Set local Piper voice to {}", voice_id);
    Ok(())
}

/// Delete a downloaded Piper voice
#[tauri::command]
pub async fn voice_delete_piper_voice(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    voice_id: String,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let models_dir = voice_state.local_piper.read().await.models_dir.clone();

    PiperLocal::delete_voice(&models_dir, &voice_id)
        .await
        .map_err(|e| format!("Failed to delete voice: {}", e))?;

    tracing::info!("Deleted Piper voice {}", voice_id);
    Ok(())
}

/// Synthesize text using local Piper TTS
#[tauri::command]
pub async fn voice_tts_speak_local(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    text: String,
    rate: Option<f32>,
    volume: Option<f32>,
) -> Result<Vec<f32>, String> {
    let voice_state = state.lock().await;
    let local_piper = voice_state.local_piper.read().await;

    // Check if piper binary is available
    let piper = PiperLocal::new(local_piper.models_dir.clone(), &local_piper.voice_id)
        .map_err(|e| format!("Failed to initialize Piper: {}", e))?;

    let config = SynthesisConfig {
        rate: rate.unwrap_or(1.0),
        volume: volume.unwrap_or(1.0),
        pitch_semitones: 0.0,
        output_raw: true,
    };

    let result = piper
        .synthesize(&text, Some(config))
        .await
        .map_err(|e| format!("TTS synthesis failed: {}", e))?;

    Ok(result.samples)
}

/// Download Piper binary for the current platform
#[tauri::command]
pub async fn voice_download_piper_binary(app: AppHandle) -> Result<String, String> {
    let bin_dir =
        PiperLocal::default_bin_dir().map_err(|e| format!("Failed to get bin directory: {}", e))?;

    tracing::info!("Downloading Piper binary to {:?}", bin_dir);

    let app_handle = app.clone();
    let piper_path = PiperLocal::download_piper(bin_dir, move |downloaded, total| {
        let progress = DownloadProgress {
            bytes_downloaded: downloaded,
            total_bytes: total,
            percentage: if total > 0 {
                (downloaded as f32 / total as f32) * 100.0
            } else {
                0.0
            },
        };
        let _ = app_handle.emit("voice:piper_binary_download_progress", progress);
    })
    .await
    .map_err(|e| format!("Failed to download Piper: {}", e))?;

    Ok(piper_path.to_string_lossy().to_string())
}

/// Check if Piper binary is available
#[tauri::command]
pub async fn voice_check_piper_binary() -> Result<bool, String> {
    let possible_paths = ["/usr/local/bin/piper", "/usr/bin/piper", "/opt/piper/piper"];

    for path in &possible_paths {
        if std::path::Path::new(path).exists() {
            return Ok(true);
        }
    }

    // Check home directory paths
    if let Some(home) = dirs::home_dir() {
        let paths = [
            home.join(".local/bin/piper"),
            home.join(".agiworkforce/bin/piper"),
        ];
        for path in &paths {
            if path.exists() {
                return Ok(true);
            }
        }
    }

    // Check PATH
    if which::which("piper").is_ok() {
        return Ok(true);
    }

    Ok(false)
}

// =============================================================================
// Combined Local Models Commands
// =============================================================================

/// Response for listing all local voice models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelsInfo {
    pub whisper_models: Vec<WhisperModelInfo>,
    pub piper_voices: Vec<PiperVoiceInfo>,
    pub whisper_models_dir: String,
    pub piper_models_dir: String,
    pub piper_binary_available: bool,
}

/// List all available local models (Whisper and Piper)
#[tauri::command]
pub async fn voice_list_local_models(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<LocalModelsInfo, String> {
    let voice_state = state.lock().await;
    let local_whisper = voice_state.local_whisper.read().await;
    let local_piper = voice_state.local_piper.read().await;

    let whisper_models_dir = local_whisper.models_dir.clone();
    let piper_models_dir = local_piper.models_dir.clone();

    // Get Whisper models
    let whisper_models = vec![
        WhisperModelInfo::new(WhisperModelSize::Tiny, &whisper_models_dir),
        WhisperModelInfo::new(WhisperModelSize::Base, &whisper_models_dir),
        WhisperModelInfo::new(WhisperModelSize::Small, &whisper_models_dir),
        WhisperModelInfo::new(WhisperModelSize::Medium, &whisper_models_dir),
    ];

    // Get Piper voices
    let mut piper_voices = PiperVoiceDefinitions::popular_voices();
    for voice in &mut piper_voices {
        let model_path = piper_models_dir.join(format!("{}.onnx", voice.id));
        voice.is_downloaded = model_path.exists();
        if voice.is_downloaded {
            voice.model_path = Some(model_path);
        }
    }

    // Check if Piper binary is available
    let piper_binary_available = which::which("piper").is_ok()
        || PiperLocal::default_bin_dir()
            .map(|d| d.join("piper").exists())
            .unwrap_or(false);

    Ok(LocalModelsInfo {
        whisper_models,
        piper_voices,
        whisper_models_dir: whisper_models_dir.to_string_lossy().to_string(),
        piper_models_dir: piper_models_dir.to_string_lossy().to_string(),
        piper_binary_available,
    })
}

// =============================================================================
// Barge-In Detection Commands
// =============================================================================

/// Barge-in detection status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BargeInStatus {
    /// Whether barge-in detection is enabled
    pub enabled: bool,
    /// Whether barge-in monitoring is currently active
    pub monitoring_active: bool,
    /// Current sensitivity setting (0.0 - 1.0)
    pub sensitivity: f32,
    /// Minimum speech duration threshold (ms)
    pub min_speech_ms: u32,
    /// Detection statistics
    pub stats: BargeInStats,
}

/// Enable or disable barge-in detection globally
///
/// When enabled, the system will monitor microphone input during TTS playback
/// and interrupt TTS if the user starts speaking.
#[tauri::command]
pub async fn voice_enable_barge_in(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    app_handle: AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let voice_state = state.lock().await;
    let mut barge_in = voice_state.barge_in.write().await;

    if enabled && !barge_in.enabled {
        // Initialize barge-in detector if needed
        #[cfg(feature = "vad")]
        {
            if barge_in.detector.is_none() {
                // Try to get or create VAD
                let vad_guard = voice_state.vad.read().await;
                if let Some(ref vad) = *vad_guard {
                    match BargeInDetector::new(vad.clone(), barge_in.config.clone()) {
                        Ok(detector) => {
                            barge_in.detector = Some(detector);
                            tracing::info!("Barge-in detector initialized");
                        }
                        Err(e) => {
                            return Err(format!("Failed to initialize barge-in detector: {}", e));
                        }
                    }
                } else {
                    // Create VAD first
                    drop(vad_guard);
                    let mut vad_guard = voice_state.vad.write().await;
                    match SharedVad::with_defaults() {
                        Ok(vad) => {
                            *vad_guard = Some(vad.clone());
                            match BargeInDetector::new(vad, barge_in.config.clone()) {
                                Ok(detector) => {
                                    barge_in.detector = Some(detector);
                                    tracing::info!("VAD and barge-in detector initialized");
                                }
                                Err(e) => {
                                    return Err(format!(
                                        "Failed to initialize barge-in detector: {}",
                                        e
                                    ));
                                }
                            }
                        }
                        Err(e) => {
                            return Err(format!("Failed to initialize VAD: {}", e));
                        }
                    }
                }
            }
        }

        #[cfg(not(feature = "vad"))]
        {
            return Err(
                "Barge-in detection requires VAD feature. Rebuild with --features vad".to_string(),
            );
        }

        #[cfg(feature = "vad")]
        {
            barge_in.enabled = true;
            tracing::info!("Barge-in detection enabled");

            // Emit event
            let _ = app_handle.emit("voice:barge_in_enabled", true);
        }
    } else if !enabled && barge_in.enabled {
        // Stop any active monitoring
        if let Some(handle) = barge_in.handle.take() {
            handle.stop();
        }
        barge_in.enabled = false;
        tracing::info!("Barge-in detection disabled");

        // Emit event
        let _ = app_handle.emit("voice:barge_in_enabled", false);
    }

    Ok(barge_in.enabled)
}

/// Set barge-in detection sensitivity
///
/// Higher sensitivity (closer to 1.0) makes it easier to trigger barge-in.
/// Lower sensitivity (closer to 0.0) requires more distinct speech.
#[tauri::command]
pub async fn voice_set_barge_in_sensitivity(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    sensitivity: f32,
) -> Result<f32, String> {
    let clamped = sensitivity.clamp(0.0, 1.0);

    let voice_state = state.lock().await;
    let mut barge_in = voice_state.barge_in.write().await;

    barge_in.config.sensitivity = clamped;

    #[cfg(feature = "vad")]
    if let Some(ref mut detector) = barge_in.detector {
        detector.set_sensitivity(clamped);
    }

    tracing::debug!("Barge-in sensitivity set to {}", clamped);
    Ok(clamped)
}

/// Get current barge-in detection status
#[tauri::command]
pub async fn voice_get_barge_in_status(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<BargeInStatus, String> {
    let voice_state = state.lock().await;
    let barge_in = voice_state.barge_in.read().await;

    let monitoring_active = barge_in
        .handle
        .as_ref()
        .map(|h| h.is_active())
        .unwrap_or(false);

    #[cfg(feature = "vad")]
    let stats = barge_in
        .detector
        .as_ref()
        .map(|d| d.stats())
        .unwrap_or(BargeInStats {
            total_detections: 0,
            avg_latency_ms: 0,
        });

    #[cfg(not(feature = "vad"))]
    let stats = BargeInStats {
        total_detections: 0,
        avg_latency_ms: 0,
    };

    Ok(BargeInStatus {
        enabled: barge_in.enabled,
        monitoring_active,
        sensitivity: barge_in.config.sensitivity,
        min_speech_ms: barge_in.config.min_speech_ms,
        stats,
    })
}

/// Configure barge-in detection parameters
#[tauri::command]
pub async fn voice_configure_barge_in(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    sensitivity: Option<f32>,
    min_speech_ms: Option<u32>,
    consecutive_frames_threshold: Option<u32>,
) -> Result<BargeInConfig, String> {
    let voice_state = state.lock().await;
    let mut barge_in = voice_state.barge_in.write().await;

    if let Some(s) = sensitivity {
        barge_in.config.sensitivity = s.clamp(0.0, 1.0);
    }

    if let Some(ms) = min_speech_ms {
        barge_in.config.min_speech_ms = ms.clamp(10, 1000);
    }

    if let Some(threshold) = consecutive_frames_threshold {
        barge_in.config.consecutive_frames_threshold = threshold.clamp(1, 20);
    }

    #[cfg(feature = "vad")]
    {
        // Extract config values before mutable borrow of detector
        let sensitivity = barge_in.config.sensitivity;
        let min_speech_ms = barge_in.config.min_speech_ms;

        if let Some(ref mut detector) = barge_in.detector {
            detector.set_sensitivity(sensitivity);
            detector.set_min_speech_ms(min_speech_ms);
        }
    }

    tracing::debug!("Barge-in config updated: {:?}", barge_in.config);
    Ok(barge_in.config.clone())
}

/// Start barge-in monitoring for current TTS playback
///
/// This is typically called automatically when TTS starts, but can be
/// invoked manually if needed.
#[tauri::command]
pub async fn voice_start_barge_in_monitoring(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    #[allow(unused_variables)] app_handle: AppHandle,
) -> Result<bool, String> {
    let voice_state = state.lock().await;
    let mut barge_in = voice_state.barge_in.write().await;

    if !barge_in.enabled {
        return Err("Barge-in detection is not enabled".to_string());
    }

    // Stop any existing monitoring
    if let Some(handle) = barge_in.handle.take() {
        handle.stop();
    }

    #[cfg(feature = "vad")]
    {
        if let Some(ref detector) = barge_in.detector {
            let tts_player = voice_state.tts_player.clone();
            let app_handle_clone = app_handle.clone();

            match detector.start_monitoring(move |event| {
                tracing::info!(
                    "Barge-in detected! Latency: {}ms",
                    event.detection_latency_ms
                );

                // Emit barge-in event
                let _ = app_handle_clone.emit("voice:barge_in_detected", &event);

                // Stop TTS playback
                if let Ok(guard) = tts_player.try_read() {
                    if let Some(ref player) = *guard {
                        if let Some(interrupt_event) = player.handle_barge_in() {
                            let _ =
                                app_handle_clone.emit("voice:tts_interrupted", &interrupt_event);
                        }
                    }
                }
            }) {
                Ok(handle) => {
                    barge_in.handle = Some(handle);
                    tracing::debug!("Barge-in monitoring started");
                    return Ok(true);
                }
                Err(e) => {
                    return Err(format!("Failed to start barge-in monitoring: {}", e));
                }
            }
        } else {
            return Err("Barge-in detector not initialized".to_string());
        }
    }

    #[cfg(not(feature = "vad"))]
    Err("Barge-in detection requires VAD feature".to_string())
}

/// Stop barge-in monitoring
#[tauri::command]
pub async fn voice_stop_barge_in_monitoring(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<bool, String> {
    let voice_state = state.lock().await;
    let mut barge_in = voice_state.barge_in.write().await;

    if let Some(handle) = barge_in.handle.take() {
        handle.stop();
        tracing::debug!("Barge-in monitoring stopped");
        Ok(true)
    } else {
        Ok(false)
    }
}

// =============================================================================
// Enhanced TTS Commands with Barge-In Support
// =============================================================================

/// Speak text with barge-in support
///
/// This command:
/// 1. Starts TTS playback
/// 2. If barge-in is enabled, starts monitoring
/// 3. Emits appropriate events (started, completed, or interrupted)
#[tauri::command]
pub async fn voice_tts_speak_with_barge_in(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    app_handle: AppHandle,
    text: String,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let tts_config = voice_state.tts_config.read().await.clone();

    // Create or get TTS player
    {
        let mut player_guard = voice_state.tts_player.write().await;
        if player_guard.is_none() {
            *player_guard = Some(TtsPlayer::from_config(tts_config.clone()));
        }
    }

    // Check if barge-in should be started
    let barge_in_enabled = {
        let barge_in = voice_state.barge_in.read().await;
        barge_in.enabled
    };

    // Start barge-in monitoring if enabled
    if barge_in_enabled {
        // Stop any existing monitoring first
        {
            let mut barge_in = voice_state.barge_in.write().await;
            if let Some(handle) = barge_in.handle.take() {
                handle.stop();
            }
        }

        #[cfg(feature = "vad")]
        {
            let barge_in_guard = voice_state.barge_in.read().await;
            if let Some(ref detector) = barge_in_guard.detector {
                let tts_player = voice_state.tts_player.clone();
                let app_handle_clone = app_handle.clone();

                if let Ok(handle) = detector.start_monitoring(move |event| {
                    let _ = app_handle_clone.emit("voice:barge_in_detected", &event);

                    if let Ok(guard) = tts_player.try_read() {
                        if let Some(ref player) = *guard {
                            if let Some(interrupt_event) = player.handle_barge_in() {
                                let _ = app_handle_clone
                                    .emit("voice:tts_interrupted", &interrupt_event);
                            }
                        }
                    }
                }) {
                    drop(barge_in_guard);
                    let mut barge_in = voice_state.barge_in.write().await;
                    barge_in.handle = Some(handle);
                }
            }
        }
    }

    // Emit started event
    let _ = app_handle.emit(
        "voice:tts_started",
        serde_json::json!({ "text": text.clone() }),
    );

    // Perform synthesis (this will be interrupted if barge-in occurs)
    let player_guard = voice_state.tts_player.read().await;
    if let Some(ref player) = *player_guard {
        match player.speak(&text).await {
            Ok(event) => {
                // Stop barge-in monitoring
                drop(player_guard);
                let mut barge_in = voice_state.barge_in.write().await;
                if let Some(handle) = barge_in.handle.take() {
                    handle.stop();
                }

                // Emit completion event
                let _ = app_handle.emit("voice:tts_completed", &event);
                Ok(())
            }
            Err(e) => {
                // Stop barge-in monitoring
                drop(player_guard);
                let mut barge_in = voice_state.barge_in.write().await;
                if let Some(handle) = barge_in.handle.take() {
                    handle.stop();
                }

                // Emit error event
                let _ = app_handle.emit(
                    "voice:tts_error",
                    serde_json::json!({
                        "text": text,
                        "error": e.to_string()
                    }),
                );
                Err(e.to_string())
            }
        }
    } else {
        Err("TTS player not initialized".to_string())
    }
}

/// Stop TTS playback manually
#[tauri::command]
pub async fn voice_tts_stop(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let voice_state = state.lock().await;

    // Stop barge-in monitoring
    {
        let mut barge_in = voice_state.barge_in.write().await;
        if let Some(handle) = barge_in.handle.take() {
            handle.stop();
        }
    }

    // Stop TTS playback
    let player_guard = voice_state.tts_player.read().await;
    if let Some(ref player) = *player_guard {
        if let Some(event) = player.stop_playback(TtsInterruptReason::ManualStop) {
            let _ = app_handle.emit("voice:tts_interrupted", &event);
            Ok(true)
        } else {
            Ok(false)
        }
    } else {
        Ok(false)
    }
}

/// Check if TTS is currently playing
#[tauri::command]
pub async fn voice_tts_is_playing(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<bool, String> {
    let voice_state = state.lock().await;
    let player_guard = voice_state.tts_player.read().await;
    Ok(player_guard
        .as_ref()
        .map(|p| p.is_playing())
        .unwrap_or(false))
}
