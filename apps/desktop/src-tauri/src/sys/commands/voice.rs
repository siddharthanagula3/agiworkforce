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
use crate::sys::account::{get_access_token, get_api_base_url};
use crate::sys::commands::settings_v2::SettingsServiceState;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
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
    pub model: String,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VoiceProvider {
    Cloud,
    WebSpeech,
    Local,
}

/// Barge-in detection state
#[derive(Default)]
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

/// Holds state for an active cpal audio recording session.
///
/// Uses `std::sync::Mutex` because `cpal::Stream` is not `Send` -- the stream
/// itself lives on a dedicated OS thread and we only store it here so it is not
/// dropped prematurely. The `stop_flag` + `samples` are shared with the audio
/// callback via `Arc`.
pub struct AudioRecordingState {
    /// When set to `true`, the audio callback stops pushing samples.
    pub stop_flag: Arc<std::sync::atomic::AtomicBool>,
    /// Accumulated f32 mono samples at the device's native sample rate.
    pub samples: Arc<std::sync::Mutex<Vec<f32>>>,
    /// The sample rate reported by the input device (needed for WAV encoding).
    pub sample_rate: u32,
    /// Number of channels reported by the input device.
    pub channels: u16,
    /// Join handle for the dedicated OS thread that owns the cpal::Stream.
    /// We keep this so the stream stays alive until we join the thread.
    pub thread_handle: Option<std::thread::JoinHandle<()>>,
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
    /// Active Wispr Flow recording session (if any).
    /// Uses `std::sync::Mutex` because cpal::Stream is not Send.
    pub recording: Arc<std::sync::Mutex<Option<AudioRecordingState>>>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(VoiceSettings {
                provider: VoiceProvider::Cloud,
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
            recording: Arc::new(std::sync::Mutex::new(None)),
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
        VoiceProvider::Cloud => {
            transcribe_with_cloud(&audio_path, &settings, &voice_state.client).await
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
    provider: Option<String>,
    language: Option<String>,
    state: State<'_, Arc<Mutex<VoiceState>>>,
    settings_state: State<'_, SettingsServiceState>,
) -> Result<VoiceTranscription, String> {
    tracing::info!(
        "Transcribing audio blob ({} bytes, format: {}, provider: {:?})",
        audio_data.len(),
        format,
        provider
    );

    // Validate format is a safe file extension
    let format_re = regex::Regex::new(r"^[a-z0-9]{1,10}$").expect("format regex");
    if !format_re.is_match(&format) {
        return Err(format!("Invalid audio format: {}", format));
    }

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("voice_{}.{}", uuid::Uuid::new_v4(), format));

    std::fs::write(&temp_file, &audio_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let result = {
        let voice_state = state.lock().await;
        let settings = voice_state.settings.lock().await;

        let use_openai_direct = provider.as_deref() == Some("openai_whisper");

        let effective_provider = match provider.as_deref() {
            Some("local_whisper") | Some("local") => VoiceProvider::Local,
            Some("deepgram") => {
                tracing::warn!(
                    "[voice] Deepgram uses real-time streaming, not blob transcription. \
                     Falling back to managed cloud for this request."
                );
                settings.provider.clone()
            }
            Some(_) | None => settings.provider.clone(),
        };
        let effective_language = language.or_else(|| settings.language.clone());
        let overridden = VoiceSettings {
            provider: effective_provider,
            model: settings.model.clone(),
            language: effective_language,
        };
        drop(settings);

        if use_openai_direct {
            // Retrieve the user's OpenAI API key from SettingsService
            let api_key = {
                let svc = settings_state
                    .service
                    .lock()
                    .map_err(|e| format!("Failed to lock settings service: {}", e))?;
                svc.get_api_key("openai")
                    .unwrap_or_else(|e| {
                        tracing::warn!("[voice] Failed to retrieve OpenAI API key: {}", e);
                        String::new()
                    })
            };

            if api_key.is_empty() {
                tracing::debug!(
                    "[voice] No OpenAI key in settings, falling back to managed cloud"
                );
                transcribe_with_cloud(&temp_file, &overridden, &voice_state.client).await
            } else {
                transcribe_with_openai_direct(
                    &temp_file,
                    &overridden,
                    &voice_state.client,
                    &api_key,
                )
                .await
            }
        } else {
            match overridden.provider {
                VoiceProvider::Cloud => {
                    transcribe_with_cloud(&temp_file, &overridden, &voice_state.client).await
                }
                VoiceProvider::WebSpeech => {
                    Err("Web Speech API transcription must be done from frontend".to_string())
                }
                VoiceProvider::Local => {
                    let local_whisper = voice_state.local_whisper.read().await;
                    transcribe_with_local_whisper(
                        &temp_file,
                        &local_whisper,
                        overridden.language,
                    )
                    .await
                }
            }
        }
    };

    let _ = std::fs::remove_file(&temp_file);
    result
}

#[tauri::command]
pub async fn voice_configure(
    provider: String,
    model: Option<String>,
    language: Option<String>,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    tracing::info!("Configuring voice input: provider={}", provider);

    let voice_state = state.lock().await;
    let mut settings = voice_state.settings.lock().await;

    settings.provider = match provider.as_str() {
        "cloud" | "managed_cloud" | "managedcloud" => VoiceProvider::Cloud,
        "webspeech" => VoiceProvider::WebSpeech,
        "local" => VoiceProvider::Local,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

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

// NOTE: Voice recording is handled entirely in the frontend using browser MediaRecorder API.
// This provides better UX with real-time visual feedback and access to audio constraints.
// Backend transcription happens via voice_transcribe_blob command.
//
// If you need backend recording in the future:
// 1. Add audio capture using cpal or rodio crate
// 2. Store audio chunks in VoiceState
// 3. Return transcription result from voice_stop_recording
// 4. Update VoiceMicButton to use the returned transcription

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

async fn transcribe_with_cloud(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
    client: &Client,
) -> Result<VoiceTranscription, String> {
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

    transcribe_with_managed_cloud(client, form).await
}

async fn transcribe_with_managed_cloud(
    client: &Client,
    form: reqwest::multipart::Form,
) -> Result<VoiceTranscription, String> {
    let token = get_access_token().map_err(|e| format!("Managed Cloud auth required: {}", e))?;
    let base = get_api_base_url();
    let url = format!("{}/api/llm/v1/audio/transcriptions", base);

    let response = client
        .post(url)
        .bearer_auth(token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Whisper Cloud API error: {}", error_text));
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

/// Transcribe using the user's own OpenAI API key from SettingsService.
/// Falls back to managed cloud if no key is stored.
async fn transcribe_with_openai_direct(
    audio_path: &PathBuf,
    settings: &VoiceSettings,
    client: &Client,
    api_key: &str,
) -> Result<VoiceTranscription, String> {
    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    let extension = audio_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webm");

    let file_part = reqwest::multipart::Part::bytes(audio_data)
        .file_name(format!("audio.{}", extension))
        .mime_str(&format!("audio/{}", extension))
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", "whisper-1");

    if let Some(ref lang) = settings.language {
        form = form.text("language", lang.clone());
    }

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("OpenAI Whisper request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI Whisper error {}: {}", status, body));
    }

    let whisper_response: WhisperResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Whisper response: {}", e))?;

    Ok(VoiceTranscription {
        text: whisper_response.text,
        language: whisper_response.language,
        duration: whisper_response.duration,
        confidence: None,
    })
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

// =============================================================================
// Wispr Flow Speech Recording / Transcription
// =============================================================================

/// Result of a speech-to-text transcription via Wispr Flow dictation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechTranscriptResult {
    pub text: String,
    pub confidence: f32,
    pub language: String,
}

/// Encode f32 mono samples into a WAV byte buffer (PCM 16-bit, mono).
///
/// This is a minimal inline WAV encoder so we avoid adding the `hound` crate.
fn encode_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len() as u32;
    let bits_per_sample: u16 = 16;
    let num_channels: u16 = 1;
    let byte_rate = sample_rate * u32::from(num_channels) * u32::from(bits_per_sample) / 8;
    let block_align = num_channels * bits_per_sample / 8;
    let data_size = num_samples * u32::from(bits_per_sample) / 8;
    let file_size = 36 + data_size; // 44-byte header minus 8 for RIFF+size

    let mut buf = Vec::with_capacity(44 + data_size as usize);

    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&file_size.to_le_bytes());
    buf.extend_from_slice(b"WAVE");

    // fmt sub-chunk
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes()); // sub-chunk size
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM format
    buf.extend_from_slice(&num_channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data sub-chunk
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_size.to_le_bytes());

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let i16_val = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&i16_val.to_le_bytes());
    }

    buf
}

/// Resample audio from `src_rate` to `target_rate` using simple linear interpolation.
/// Returns the original samples unchanged if rates already match.
fn resample_linear(samples: &[f32], src_rate: u32, target_rate: u32) -> Vec<f32> {
    if src_rate == target_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = src_rate as f64 / target_rate as f64;
    let out_len = ((samples.len() as f64) / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_idx = i as f64 * ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(samples.len() - 1);
        let frac = (src_idx - idx0 as f64) as f32;
        out.push(samples[idx0] * (1.0 - frac) + samples[idx1] * frac);
    }
    out
}

/// Start audio recording for Wispr Flow dictation.
///
/// Opens the system default input device via cpal, spawns a dedicated OS thread
/// (because `cpal::Stream` is not `Send`), and begins collecting mono f32 samples
/// into a shared buffer.  Emits `voice:recording:started` so the frontend overlay
/// appears.
#[tauri::command]
pub async fn speech_start_recording(
    _provider: String,
    app_handle: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    let voice_state = state.lock().await;

    // Check if a recording is already in progress
    {
        let guard = voice_state
            .recording
            .lock()
            .map_err(|e| format!("Recording lock poisoned: {}", e))?;
        if guard.is_some() {
            return Err("A recording session is already in progress".to_string());
        }
    }

    // Query default input device on the current thread to get config,
    // then spawn a dedicated OS thread for the stream.
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No default audio input device found".to_string())?;

    let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
    tracing::info!("[wispr] Using audio input device: {}", device_name);

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get input device config: {}", e))?;

    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    tracing::info!(
        "[wispr] Audio config: {} Hz, {} channel(s)",
        sample_rate,
        channels
    );

    let stop_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let samples: Arc<std::sync::Mutex<Vec<f32>>> = Arc::new(std::sync::Mutex::new(Vec::new()));

    let stop_flag_stream = stop_flag.clone();
    let stop_flag_poll = stop_flag.clone();
    let samples_cb = samples.clone();
    let ch = channels as usize;

    // Spawn a dedicated OS thread for the cpal stream (not Send).
    let config_for_stream: cpal::StreamConfig = supported_config.into();
    let thread_handle = std::thread::spawn(move || {
        let stream_result = device.build_input_stream(
            &config_for_stream,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if stop_flag_stream.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                // Convert to mono if multi-channel
                let mono: Vec<f32> = if ch > 1 {
                    data.chunks(ch)
                        .map(|chunk| chunk.iter().sum::<f32>() / ch as f32)
                        .collect()
                } else {
                    data.to_vec()
                };
                if let Ok(mut buf) = samples_cb.lock() {
                    buf.extend_from_slice(&mono);
                }
            },
            |err| {
                tracing::error!("[wispr] Audio stream error: {}", err);
            },
            None,
        );

        match stream_result {
            Ok(stream) => {
                if let Err(e) = stream.play() {
                    tracing::error!("[wispr] Failed to start audio stream: {}", e);
                    return;
                }
                tracing::info!("[wispr] Audio recording stream started");
                // Keep the thread (and hence the stream) alive until stop_flag is set.
                // Poll at 50 ms intervals.
                while !stop_flag_poll.load(std::sync::atomic::Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                // Stream is dropped here when thread exits, stopping capture.
                tracing::info!("[wispr] Audio recording stream stopped");
            }
            Err(e) => {
                tracing::error!("[wispr] Failed to build input stream: {}", e);
            }
        }
    });

    // Wait briefly (up to ~200ms) for stream to begin capturing, so the caller
    // doesn't get Ok before the thread has actually started. This is best-effort.
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Store the recording state
    {
        let mut guard = voice_state
            .recording
            .lock()
            .map_err(|e| format!("Recording lock poisoned: {}", e))?;

        // Use the same stop_flag reference. Note: stop_flag_cb was moved into the
        // thread closure, but we cloned stop_flag before that move.
        *guard = Some(AudioRecordingState {
            stop_flag: stop_flag.clone(),
            samples: samples.clone(),
            sample_rate,
            channels,
            thread_handle: Some(thread_handle),
        });
    }

    let _ = app_handle.emit("voice:recording:started", &_provider);
    tracing::info!("[wispr] Recording session started (provider={})", _provider);
    Ok(())
}

/// Stop recording and return transcription.
///
/// Sets the stop flag, joins the recording thread, encodes the captured audio
/// to WAV, writes a temp file, and routes through the existing transcription
/// backend (cloud or local Whisper depending on provider).
/// Emits `voice:recording:stopped` so the frontend shows "Transcribing..."
#[tauri::command]
pub async fn speech_stop_and_transcribe(
    _provider: String,
    language: String,
    app_handle: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<SpeechTranscriptResult, String> {
    let _ = app_handle.emit("voice:recording:stopped", ());

    let voice_state = state.lock().await;

    // Extract the recording state
    let recording = {
        let mut guard = voice_state
            .recording
            .lock()
            .map_err(|e| format!("Recording lock poisoned: {}", e))?;
        guard.take()
    };

    let recording = recording.ok_or_else(|| "No active recording session to stop".to_string())?;

    // Signal the recording thread to stop
    recording
        .stop_flag
        .store(true, std::sync::atomic::Ordering::SeqCst);

    // Join the recording thread (give it up to 2 seconds)
    if let Some(handle) = recording.thread_handle {
        let _ = handle.join();
    }

    // Extract collected samples
    let raw_samples = recording
        .samples
        .lock()
        .map_err(|e| format!("Samples lock poisoned: {}", e))?
        .clone();

    if raw_samples.is_empty() {
        return Err("No audio data was captured. Check microphone permissions.".to_string());
    }

    let duration_secs = raw_samples.len() as f32 / recording.sample_rate as f32;
    tracing::info!(
        "[wispr] Captured {} samples ({:.1}s at {} Hz)",
        raw_samples.len(),
        duration_secs,
        recording.sample_rate
    );

    // Resample to 16 kHz for transcription (Whisper expects 16 kHz)
    let target_rate = 16000u32;
    let resampled = resample_linear(&raw_samples, recording.sample_rate, target_rate);

    // Encode to WAV
    let wav_bytes = encode_wav(&resampled, target_rate);

    // Write to temp file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("wispr_{}.wav", uuid::Uuid::new_v4()));
    std::fs::write(&temp_file, &wav_bytes)
        .map_err(|e| format!("Failed to write temp WAV file: {}", e))?;

    tracing::info!(
        "[wispr] WAV written to {:?} ({} bytes)",
        temp_file,
        wav_bytes.len()
    );

    // Route through existing transcription backend
    let settings = voice_state.settings.lock().await;
    let effective_provider = match _provider.as_str() {
        "local" | "local_whisper" => VoiceProvider::Local,
        "cloud" | "managed_cloud" | "managedcloud" | "" => VoiceProvider::Cloud,
        _ => settings.provider.clone(),
    };
    let effective_settings = VoiceSettings {
        provider: effective_provider.clone(),
        model: settings.model.clone(),
        language: if language.is_empty() {
            settings.language.clone()
        } else {
            Some(language.clone())
        },
    };
    drop(settings);

    let transcription = match effective_provider {
        VoiceProvider::Cloud => {
            transcribe_with_cloud(&temp_file, &effective_settings, &voice_state.client).await
        }
        VoiceProvider::Local => {
            let local_whisper = voice_state.local_whisper.read().await;
            transcribe_with_local_whisper(
                &temp_file,
                &local_whisper,
                effective_settings.language.clone(),
            )
            .await
        }
        VoiceProvider::WebSpeech => {
            Err("Web Speech API cannot be used for backend transcription".to_string())
        }
    };

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_file);

    match transcription {
        Ok(vt) => {
            tracing::info!(
                "[wispr] Transcription complete: {} chars",
                vt.text.len()
            );
            let _ = app_handle.emit("voice:transcription:complete", &vt);
            Ok(SpeechTranscriptResult {
                text: vt.text,
                confidence: vt.confidence.unwrap_or(1.0),
                language: vt.language.unwrap_or(language),
            })
        }
        Err(e) => {
            tracing::error!("[wispr] Transcription failed: {}", e);
            Err(format!("Transcription failed: {}", e))
        }
    }
}
