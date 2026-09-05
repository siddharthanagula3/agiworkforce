//! Tauri commands for voice functionality (transcription, TTS, wake word, PTT, barge-in, Deepgram STT)
//!
//! Includes local offline fallback with Whisper.cpp for STT and Piper for TTS.

use crate::features::speech::{
    create_tts_provider, BargeInConfig, BargeInHandle, BargeInStats, DeepgramConfig, DeepgramState,
    DeepgramStreamingStats, PiperLocal, PiperVoiceDefinitions, PiperVoiceInfo, PttConfig,
    PushToTalk, SynthesisConfig, SystemTts, TranscriptionConfig, TtsConfig, TtsInterruptReason,
    TtsPlayer, TtsProvider, Voice, VoiceWake, WakeWordConfig, WakeWordEvent, WhisperLocal,
    WhisperModelInfo, WhisperModelSize,
};
#[cfg(feature = "vad")]
use crate::features::speech::{BargeInDetector, SharedVad};
use crate::sys::account::{get_access_token, get_api_base_url};
use crate::sys::commands::settings_v2::SettingsServiceState;
use agiworkforce_llm::{speech, TranscriptionRequest, TranscriptionResponseFormat};
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

/// Cloud speech-to-text model, resolved from the canonical
/// `voice_transcription` routing slot that the CLI binary and the managed
/// transcription route in `apps/web` also read.
///
/// The value is posted verbatim as the multipart `model` field, so it is the
/// provider wire ID the registry declares for the slot's model key.
///
/// If the slot ever resolves to nothing this yields an empty string, which the
/// transcription endpoint rejects with a request error, an obvious failure
/// rather than a retired ID that looks valid. The registry crate's
/// `the_voice_transcription_slot_resolves_to_a_live_provider_model` asserts the
/// slot is present, so that path is not reachable with the shipped registry.
fn default_cloud_stt_model() -> String {
    agiworkforce_model_registry::slot_model(speech::TRANSCRIPTION_ROUTING_SLOT)
        .ok()
        .flatten()
        .map(|model| model.provider_model_id)
        .unwrap_or_default()
}

fn transcription_request(settings: &VoiceSettings) -> TranscriptionRequest {
    TranscriptionRequest::new(settings.model.clone(), TranscriptionResponseFormat::Json)
        .with_language(settings.language.clone())
}

fn transcription_form(
    audio_data: Vec<u8>,
    extension: &str,
    request: &TranscriptionRequest,
) -> Result<reqwest::multipart::Form, String> {
    let file_part = reqwest::multipart::Part::bytes(audio_data)
        .file_name(format!("audio.{}", extension))
        .mime_str(&format!("audio/{}", extension))
        .map_err(|e| format!("Failed to create file part: {}", e))?;

    let mut form =
        reqwest::multipart::Form::new().part(speech::TRANSCRIPTION_FILE_FIELD, file_part);
    for (field, value) in request.text_fields() {
        form = form.text(field, value);
    }
    Ok(form)
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
    /// Selected runtime model identifier
    pub model_id: Option<WhisperModelSize>,
    /// Models directory
    pub models_dir: PathBuf,
}

impl Default for LocalWhisperState {
    fn default() -> Self {
        let models_dir = WhisperLocal::default_models_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("whisper"));
        Self {
            whisper: None,
            model_id: None,
            models_dir,
        }
    }
}

/// State for local Piper TTS
pub struct LocalPiperState {
    /// Piper instance (lazy loaded)
    pub piper: Option<PiperLocal>,
    /// Selected voice ID
    pub voice_id: Option<String>,
    /// Models directory
    pub models_dir: PathBuf,
}

impl Default for LocalPiperState {
    fn default() -> Self {
        let models_dir =
            PiperLocal::default_models_dir().unwrap_or_else(|_| std::env::temp_dir().join("piper"));
        Self {
            piper: None,
            voice_id: None,
            models_dir,
        }
    }
}

fn selected_whisper_model(
    state: &LocalWhisperState,
) -> Result<(WhisperModelSize, PathBuf), String> {
    let models = WhisperLocal::discover_models(&state.models_dir).map_err(|e| e.to_string())?;
    let selected = state.model_id.as_ref().and_then(|selected| {
        models
            .iter()
            .find(|model| &model.size == selected && model.is_downloaded)
    });
    let model = selected
        .or_else(|| models.iter().find(|model| model.is_downloaded))
        .ok_or_else(|| "No local speech model is installed".to_string())?;
    let path = model
        .path
        .clone()
        .ok_or_else(|| "Selected local speech model has no installed artifact".to_string())?;
    Ok((model.size.clone(), path))
}

fn selected_piper_voice(state: &LocalPiperState) -> Result<String, String> {
    let voices = PiperVoiceDefinitions::discover(&state.models_dir).map_err(|e| e.to_string())?;
    state
        .voice_id
        .as_ref()
        .and_then(|selected| {
            voices
                .iter()
                .find(|voice| &voice.id == selected && voice.is_downloaded)
        })
        .or_else(|| voices.iter().find(|voice| voice.is_downloaded))
        .map(|voice| voice.id.clone())
        .ok_or_else(|| "No local voice is installed".to_string())
}

// The native capture session state now lives in
// `features/speech/dictation/capture.rs` (plan stage 3); `CaptureHandle`
// replaces the old `AudioRecordingState`.
use crate::features::speech::dictation::CaptureHandle;

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
    /// Active AGI Dictation recording session (if any).
    /// Uses `std::sync::Mutex` because cpal::Stream is not Send.
    pub recording: Arc<std::sync::Mutex<Option<CaptureHandle>>>,
    /// Task draining [`VoiceWake::start`]'s receiver onto `wake:event`.
    /// Held so a re-enable cannot leave two forwarders on the same detector.
    pub wake_forwarder: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl VoiceState {
    pub fn new() -> Self {
        Self {
            settings: Arc::new(Mutex::new(VoiceSettings {
                provider: VoiceProvider::Cloud,
                model: default_cloud_stt_model(),
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
            wake_forwarder: Arc::new(std::sync::Mutex::new(None)),
        }
    }
}

impl Default for VoiceState {
    fn default() -> Self {
        Self::new()
    }
}

// camelCase on the wire: the frontend `VoiceCapabilities` interface in
// `apps/desktop/src/api/voice.ts` has always declared camelCase fields, but
// this struct used to serialize snake_case, so every capability read as
// `undefined` (TTS/VAD/local-model status permanently displayed as
// unavailable). Keep the two in sync.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    /// Capability probe for system-wide (outside-the-app) dictation.
    /// Sourced from the dictation coordinator's single truth; stays `false`
    /// until the release gates in `docs/specs/desktop-global-voice/spec.md`
    /// pass (`DESKTOP-SYSTEM-DICTATION-UNWIRED-01`). The settings UI must
    /// present the global control as unavailable while this is false.
    pub system_dictation_available: bool,
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

    // Explicit-mode adapter (plan stage 3, boundary contract): the caller's
    // provider string is parsed fail-closed BEFORE any temp file is written.
    // an unknown value errors, and `deepgram` (streaming-only) is refused
    // explicitly. Previously both silently fell back to the settings
    // provider, and a BYOK OpenAI selection without a key silently rerouted
    // the audio to managed cloud. Audio never crosses a boundary the user did
    // not explicitly select.
    let explicit_mode = match provider.as_deref() {
        Some(raw) => Some(
            crate::features::speech::dictation::parse_transcription_mode(raw)
                .map_err(|e| e.to_string())?,
        ),
        None => None,
    };

    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("voice_{}.{}", uuid::Uuid::new_v4(), format));

    std::fs::write(&temp_file, &audio_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let result = {
        use crate::features::speech::dictation::TranscriptionMode;

        let voice_state = state.lock().await;
        let settings = voice_state.settings.lock().await;

        // When no provider is passed, the user's stored voice settings (an
        // explicit configuration) decide. The Err arm flows through `result`
        // so the temp-file cleanup below still runs.
        let mode_result: Result<TranscriptionMode, String> = match explicit_mode {
            Some(mode) => Ok(mode),
            None => match settings.provider {
                VoiceProvider::Cloud => Ok(TranscriptionMode::Managed),
                VoiceProvider::Local => Ok(TranscriptionMode::Local),
                VoiceProvider::WebSpeech => {
                    Err("Web Speech API transcription must be done from frontend".to_string())
                }
            },
        };

        match mode_result {
            Err(error) => Err(error),
            Ok(mode) => {
                let effective_language = language.or_else(|| settings.language.clone());
                let overridden = VoiceSettings {
                    provider: match mode {
                        TranscriptionMode::Local => VoiceProvider::Local,
                        TranscriptionMode::Managed | TranscriptionMode::ByokOpenai => {
                            VoiceProvider::Cloud
                        }
                    },
                    model: settings.model.clone(),
                    language: effective_language,
                };
                drop(settings);

                match mode {
                    TranscriptionMode::ByokOpenai => {
                        // Retrieve the user's OpenAI API key from SettingsService
                        let api_key = {
                            let svc = settings_state
                                .service
                                .lock()
                                .map_err(|e| format!("Failed to lock settings service: {}", e))?;
                            svc.get_api_key("openai").unwrap_or_else(|e| {
                                tracing::warn!("[voice] Failed to retrieve OpenAI API key: {}", e);
                                String::new()
                            })
                        };

                        if api_key.is_empty() {
                            // BYOK without a key fails closed, never silently
                            // reroute the audio to managed cloud.
                            Err(crate::features::speech::dictation::missing_byok_openai_key_error())
                        } else {
                            transcribe_with_openai_direct(
                                &temp_file,
                                &overridden,
                                &voice_state.client,
                                &api_key,
                            )
                            .await
                        }
                    }
                    TranscriptionMode::Managed => {
                        transcribe_with_cloud(&temp_file, &overridden, &voice_state.client).await
                    }
                    TranscriptionMode::Local => {
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
        }
    };

    let _ = std::fs::remove_file(&temp_file);
    result
}

#[tauri::command]
pub async fn voice_configure(
    provider: Option<String>,
    model: Option<String>,
    language: Option<String>,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    tracing::info!("Configuring voice input: provider={:?}", provider);

    let voice_state = state.lock().await;
    let mut settings = voice_state.settings.lock().await;

    if let Some(ref p) = provider {
        settings.provider = match p.as_str() {
            "cloud" | "managed_cloud" | "managedcloud" => VoiceProvider::Cloud,
            "webspeech" => VoiceProvider::WebSpeech,
            "local" => VoiceProvider::Local,
            _ => return Err(format!("Unknown provider: {}", p)),
        };
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
    // Honest availability signal for on-device dictation. The real transcription
    // path (`transcribe_with_local_whisper` -> `WhisperLocal::transcribe`) is the
    // compiled `local-whisper` (whisper-rs) backend, NOT an external `whisper`
    // CLI. When the feature is not compiled, `WhisperLocal::transcribe` always
    // returns "Local Whisper support not compiled", so any Local Whisper
    // selection would always fail. Report availability strictly from the
    // compiled feature so the UI can hide/disable an option that cannot work.
    Ok(cfg!(feature = "local-whisper"))
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

    let form = transcription_form(audio_data, extension, &transcription_request(settings))?;

    transcribe_with_managed_cloud(client, form).await
}

async fn transcribe_with_managed_cloud(
    client: &Client,
    form: reqwest::multipart::Form,
) -> Result<VoiceTranscription, String> {
    let token = get_access_token().map_err(|e| format!("Managed Cloud auth required: {}", e))?;
    let url = speech::managed_transcriptions_url(&get_api_base_url());

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

/// Transcribe using the user's own OpenAI API key from SettingsService. The
/// caller fails closed when no key is stored; this never reroutes to managed
/// cloud.
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

    let form = transcription_form(audio_data, extension, &transcription_request(settings))?;

    let response = client
        .post(speech::OPENAI_TRANSCRIPTIONS_URL)
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
    let (_model_id, model_path) = selected_whisper_model(local_state)?;

    // Read audio file and convert to f32 samples
    let audio_data =
        std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    // Decode audio to PCM f32 samples
    // For simplicity, we expect WAV files here. In production, consider using symphonia for multiple formats.
    let (samples, sample_rate) = decode_audio_to_samples(&audio_data)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Create Whisper instance
    let whisper = WhisperLocal::new(model_path)
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
            // The loop only guarantees pos+8 bytes, but the fmt body reads up to
            // pos+23, bound-check before indexing or a truncated/malformed WAV
            // (reachable via the voice_transcribe_file IPC command) panics.
            if chunk_size >= 16 && pos + 24 <= audio_bytes.len() {
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

/// Whether the configured TTS provider can actually speak.
///
/// `TtsProvider::System` is the DEFAULT, so the previous
/// `matches!(provider, TtsProvider::System)` test reported
/// `tts_available: true` on every platform, including the Windows and Linux
/// builds where `SystemTts::speak_sync` only ever returns "System TTS not
/// implemented for this platform". Settings > Voice rendered "TTS: System" and
/// Voice Mode entered `phase: 'speaking'` before swallowing the error, so the
/// user was shown an available feature that produced silence.
///
/// `system_tts_supported` is passed in rather than read here so the false arm.
/// the one that only occurs on Windows and Linux, stays reachable from a test
/// running on any host. The single production caller passes
/// `SystemTts::platform_supported()`.
fn tts_provider_available(config: &TtsConfig, system_tts_supported: bool) -> bool {
    match config.provider {
        TtsProvider::System => system_tts_supported,
        TtsProvider::ElevenLabs => {
            config.api_key.is_some()
                && config
                    .model_id
                    .as_deref()
                    .is_some_and(|model_id| !model_id.trim().is_empty())
        }
        TtsProvider::OpenAi => {
            config.api_key.is_some()
                && !crate::features::speech::tts::openai_default_tts_model().is_empty()
        }
    }
}

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

    let whisper_selection = selected_whisper_model(&local_whisper).ok();
    let local_stt_available = whisper_selection.is_some();

    // Local Piper TTS needs BOTH the voice model and the piper binary. Checking
    // only `<voice>.onnx` made Settings > Voice print "Local TTS: <voice>" for a
    // user who downloaded a voice but never ran `voice_download_piper_binary`,
    // and `voice_tts_speak_local` then failed with "Piper binary not found".
    // `PiperLocal::new` is the exact constructor that command calls and it
    // verifies both, so this cannot drift away from what speaking requires.
    let piper_voice = selected_piper_voice(&local_piper).ok();
    let local_tts_available = piper_voice
        .as_deref()
        .is_some_and(|voice_id| PiperLocal::new(local_piper.models_dir.clone(), voice_id).is_ok());

    Ok(VoiceCapabilities {
        tts_available: tts_provider_available(&tts_config, SystemTts::platform_supported()),
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
            whisper_selection.map(|(model_id, _)| model_id.to_string())
        } else {
            None
        },
        local_tts_available,
        local_tts_voice: if local_tts_available {
            piper_voice
        } else {
            None
        },
        system_dictation_available: crate::features::speech::dictation::system_dictation_available(
        ),
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

/// Wire version for `wake:event` payloads.
pub const WAKE_EVENT_VERSION: u32 = 1;

/// Whether saying a configured wake phrase can actually trigger anything in
/// this build. Single source of truth for the refusal below.
///
/// Stays `false` while `features/speech/wake.rs`'s detection loop only reports
/// voice activity: it buffers speech and emits a fixed `speech_detected`
/// marker instead of transcribing the utterance, so no configured phrase can
/// ever match. Flip it in the same change that makes that loop transcribe.
/// never from UI or settings code.
pub const fn wake_phrase_detection_available() -> bool {
    false
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WakeEventPayload {
    version: u32,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    phrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    confidence: f32,
    timestamp: i64,
}

fn emit_wake_event(app: &AppHandle, payload: &WakeEventPayload) {
    if let Err(error) = app.emit("wake:event", payload) {
        tracing::warn!("[wake] failed to emit {}: {}", payload.kind, error);
    }
}

/// A detector report becomes a frontend event only when it names a configured
/// wake phrase. Voice activity that matches nothing must not reach the webview
/// as a trigger, or any noise would open dictation.
fn wake_detection_payload(wake: &VoiceWake, event: &WakeWordEvent) -> Option<WakeEventPayload> {
    let (phrase, confidence) = wake.matches_wake_phrase(&event.phrase_detected)?;
    Some(WakeEventPayload {
        version: WAKE_EVENT_VERSION,
        kind: "detected",
        phrase: Some(phrase.to_string()),
        detail: None,
        confidence,
        timestamp: event.timestamp,
    })
}

/// Enable wake word detection.
///
/// Fails closed while [`wake_phrase_detection_available`] is false: refusing
/// keeps the microphone shut and emits a `refused` event the webview can show,
/// rather than opening a permanent capture stream behind a "Listening" badge
/// for a phrase that cannot fire.
#[tauri::command]
pub async fn voice_wake_enable(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    config: Option<WakeWordConfig>,
    app: AppHandle,
) -> Result<(), String> {
    const UNAVAILABLE: &str =
        "Wake-phrase detection is not available in this build, the detector reports voice activity but does not yet transcribe it, so no wake phrase can match.";

    let voice_state = state.lock().await;
    let mut wake = voice_state.wake.write().await;

    if let Some(cfg) = config {
        wake.update_config(cfg);
    }

    if !wake_phrase_detection_available() {
        emit_wake_event(
            &app,
            &WakeEventPayload {
                version: WAKE_EVENT_VERSION,
                kind: "refused",
                phrase: None,
                detail: Some(UNAVAILABLE.to_string()),
                confidence: 0.0,
                timestamp: chrono::Utc::now().timestamp_millis(),
            },
        );
        return Err(UNAVAILABLE.to_string());
    }

    let mut enabled = wake.get_config().clone();
    enabled.enabled = true;
    wake.update_config(enabled);

    let mut events = wake.start().await.map_err(|e| e.to_string())?;
    drop(wake);

    let detector = voice_state.wake.clone();
    let forwarder = tokio::spawn(async move {
        while let Some(event) = events.recv().await {
            let payload = {
                let wake = detector.read().await;
                wake_detection_payload(&wake, &event)
            };
            match payload {
                Some(payload) => emit_wake_event(&app, &payload),
                None => tracing::debug!(
                    "[wake] voice activity ({}) matched no configured phrase",
                    event.phrase_detected
                ),
            }
        }

        emit_wake_event(
            &app,
            &WakeEventPayload {
                version: WAKE_EVENT_VERSION,
                kind: "stopped",
                phrase: None,
                detail: None,
                confidence: 0.0,
                timestamp: chrono::Utc::now().timestamp_millis(),
            },
        );
    });

    if let Some(previous) = lock_wake_forwarder(&voice_state).replace(forwarder) {
        previous.abort();
    }
    Ok(())
}

fn lock_wake_forwarder(
    state: &VoiceState,
) -> std::sync::MutexGuard<'_, Option<tokio::task::JoinHandle<()>>> {
    state
        .wake_forwarder
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Disable wake word detection. The detector thread exits and drops its
/// sender, which ends the forwarder after it emits `stopped`.
#[tauri::command]
pub async fn voice_wake_disable(state: State<'_, Arc<Mutex<VoiceState>>>) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut wake = voice_state.wake.write().await;
    wake.stop();

    // `voice_get_capabilities` reports `wake_word_enabled` from this flag, so
    // leaving it set would keep advertising a detector that has stopped.
    let mut disabled = wake.get_config().clone();
    disabled.enabled = false;
    wake.update_config(disabled);
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
    let model_id: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();
    drop(voice_state);

    tracing::info!(
        "Downloading local speech model {} to {:?}",
        model_id,
        models_dir
    );

    let app_handle = app.clone();
    let model_path =
        WhisperLocal::download_model(model_id.clone(), models_dir, move |downloaded, total| {
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
    local_whisper.model_id = Some(model_id);

    Ok(model_path.to_string_lossy().to_string())
}

/// List available Whisper models (both downloaded and available for download)
#[tauri::command]
pub async fn voice_list_whisper_models(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Vec<WhisperModelInfo>, String> {
    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();

    WhisperLocal::discover_models(&models_dir).map_err(|e| e.to_string())
}

/// Set the active Whisper model size
#[tauri::command]
pub async fn voice_set_whisper_model(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    model_size: String,
) -> Result<(), String> {
    let model_id: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let mut local_whisper = voice_state.local_whisper.write().await;
    WhisperLocal::resolve_model_path(&local_whisper.models_dir, &model_id)
        .map_err(|e| e.to_string())?;
    local_whisper.model_id = Some(model_id.clone());
    // Clear existing whisper instance so it will be reloaded with new model
    local_whisper.whisper = None;

    tracing::info!("Set local speech model to {}", model_id);
    Ok(())
}

/// Delete a downloaded Whisper model
#[tauri::command]
pub async fn voice_delete_whisper_model(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    model_size: String,
) -> Result<(), String> {
    let model_id: WhisperModelSize = model_size
        .parse()
        .map_err(|e: anyhow::Error| e.to_string())?;

    let voice_state = state.lock().await;
    let models_dir = voice_state.local_whisper.read().await.models_dir.clone();
    drop(voice_state);

    WhisperLocal::delete_model(&models_dir, &model_id)
        .await
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    let voice_state = state.lock().await;
    let mut local_whisper = voice_state.local_whisper.write().await;
    if local_whisper.model_id.as_ref() == Some(&model_id) {
        local_whisper.model_id = None;
        local_whisper.whisper = None;
    }
    tracing::info!("Deleted local speech model {}", model_id);
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
    local_piper.voice_id = Some(voice_id);

    Ok(model_path.to_string_lossy().to_string())
}

/// List available Piper voices (both downloaded and available for download)
#[tauri::command]
pub async fn voice_list_piper_voices(
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<Vec<PiperVoiceInfo>, String> {
    let voice_state = state.lock().await;
    let models_dir = voice_state.local_piper.read().await.models_dir.clone();
    PiperVoiceDefinitions::discover(&models_dir).map_err(|e| e.to_string())
}

/// Set the active Piper voice
#[tauri::command]
pub async fn voice_set_piper_voice(
    state: State<'_, Arc<Mutex<VoiceState>>>,
    voice_id: String,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let mut local_piper = voice_state.local_piper.write().await;
    let voices =
        PiperVoiceDefinitions::discover(&local_piper.models_dir).map_err(|e| e.to_string())?;
    if !voices
        .iter()
        .any(|voice| voice.id == voice_id && voice.is_downloaded)
    {
        return Err(format!("Local voice '{}' is not installed", voice_id));
    }
    local_piper.voice_id = Some(voice_id.clone());
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
    drop(voice_state);

    PiperLocal::delete_voice(&models_dir, &voice_id)
        .await
        .map_err(|e| format!("Failed to delete voice: {}", e))?;

    let voice_state = state.lock().await;
    let mut local_piper = voice_state.local_piper.write().await;
    if local_piper.voice_id.as_deref() == Some(voice_id.as_str()) {
        local_piper.voice_id = None;
        local_piper.piper = None;
    }
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
    let voice_id = selected_piper_voice(&local_piper)?;
    let piper = PiperLocal::new(local_piper.models_dir.clone(), &voice_id)
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
    Ok(PiperLocal::binary_available())
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

    let whisper_models =
        WhisperLocal::discover_models(&whisper_models_dir).map_err(|e| e.to_string())?;
    let piper_voices =
        PiperVoiceDefinitions::discover(&piper_models_dir).map_err(|e| e.to_string())?;

    // Check if Piper binary is available
    let piper_binary_available = PiperLocal::binary_available();

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
    app_handle: AppHandle,
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
                    Ok(true)
                }
                Err(e) => Err(format!("Failed to start barge-in monitoring: {}", e)),
            }
        } else {
            Err("Barge-in detector not initialized".to_string())
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
// AGI Dictation Speech Recording / Transcription
// =============================================================================

/// Result of a speech-to-text transcription via AGI Dictation
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

/// List audio input devices for the dictation microphone picker.
#[tauri::command]
pub async fn dictation_list_input_devices(
) -> Result<Vec<crate::features::speech::dictation::InputDeviceInfo>, String> {
    crate::features::speech::dictation::list_input_devices()
}

/// Start audio recording for AGI Dictation.
///
/// Capture mechanics (device selection, sample-format dispatch, bounded
/// buffering, device-loss recovery) live in
/// `features/speech/dictation/capture.rs`. `device` selects a microphone by
/// name; when absent, or when the preferred device no longer exists, the
/// system default is used and the substitution is reported in the started
/// event payload. Emits `voice:recording:started` so the frontend overlay
/// appears.
#[tauri::command]
pub async fn speech_start_recording(
    _provider: String,
    device: Option<String>,
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

    let handle = crate::features::speech::dictation::start_capture(device.as_deref())?;
    let device_name = handle.device_name.clone();
    let requested_device_honored = handle.requested_device_honored;

    // Wait briefly for the stream to begin capturing, so the caller doesn't
    // get Ok before the thread has actually started. Best-effort, and async
    // so a Tokio worker thread is not blocked.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Store the recording state
    {
        let mut guard = voice_state
            .recording
            .lock()
            .map_err(|e| format!("Recording lock poisoned: {}", e))?;
        *guard = Some(handle);
    }

    let _ = app_handle.emit(
        "voice:recording:started",
        serde_json::json!({
            "provider": _provider,
            "device": device_name,
            "requestedDeviceHonored": requested_device_honored,
        }),
    );
    tracing::info!(
        "[dictation] Recording session started (provider={}, device={})",
        _provider,
        device_name
    );
    Ok(())
}

/// Wait (bounded) for the capture thread to finish after its stop flag has
/// been set. The capture thread polls every 50 ms, so this normally returns
/// almost immediately, but a wedged audio driver must not hold a Tokio
/// worker hostage with an unbounded join().
async fn settle_capture_thread(handle: Option<std::thread::JoinHandle<()>>) {
    if let Some(handle) = handle {
        let mut waited_ms = 0u64;
        while !handle.is_finished() && waited_ms < 2_000 {
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            waited_ms += 25;
        }
        if handle.is_finished() {
            let _ = handle.join();
        } else {
            tracing::warn!(
                "[dictation] capture thread did not stop within 2s; detaching (samples captured so far are used)"
            );
        }
    }
}

/// Cancel an active recording, discarding the captured audio without
/// transcribing it. No-op error if nothing is recording.
#[tauri::command]
pub async fn speech_cancel_recording(
    app_handle: AppHandle,
    state: State<'_, Arc<Mutex<VoiceState>>>,
) -> Result<(), String> {
    let voice_state = state.lock().await;
    let recording = {
        let mut guard = voice_state
            .recording
            .lock()
            .map_err(|e| format!("Recording lock poisoned: {}", e))?;
        guard.take()
    };
    let recording = recording.ok_or_else(|| "No active recording session to cancel".to_string())?;

    recording
        .stop_flag
        .store(true, std::sync::atomic::Ordering::SeqCst);
    settle_capture_thread(recording.thread_handle).await;

    let _ = app_handle.emit("voice:recording:stopped", ());
    tracing::info!("[dictation] Recording session cancelled; audio discarded");
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
    settings_state: State<'_, SettingsServiceState>,
) -> Result<SpeechTranscriptResult, String> {
    // Resolve the explicit transcription mode BEFORE touching the audio:
    // an unknown provider must fail closed without transcribing anywhere
    // (previously it silently fell back to the settings provider).
    use crate::features::speech::dictation::{parse_transcription_mode, TranscriptionMode};
    let mode = parse_transcription_mode(&_provider).map_err(|e| e.to_string())?;

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

    // Signal the recording thread to stop and wait for it (bounded).
    recording
        .stop_flag
        .store(true, std::sync::atomic::Ordering::SeqCst);
    settle_capture_thread(recording.thread_handle).await;

    if recording
        .device_lost
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        // Device removal mid-capture: the transcript is still produced from
        // the samples captured before the loss (recovery, not data loss).
        tracing::warn!(
            "[dictation] input device '{}' was lost during capture; transcribing partial audio",
            recording.device_name
        );
    }

    // Extract collected samples
    let (raw_samples, truncated) = {
        let mut sink = recording
            .sink
            .lock()
            .map_err(|e| format!("Samples lock poisoned: {}", e))?;
        (sink.take_samples(), sink.truncated())
    };
    if truncated {
        tracing::warn!(
            "[dictation] capture hit the bounded-buffer cap; trailing audio was dropped"
        );
    }

    if raw_samples.is_empty() {
        return Err("No audio data was captured. Check microphone permissions.".to_string());
    }

    let duration_secs = raw_samples.len() as f32 / recording.sample_rate as f32;
    tracing::info!(
        "[dictation] Captured {} samples ({:.1}s at {} Hz)",
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
    let temp_file = temp_dir.join(format!("agi_dictation_{}.wav", uuid::Uuid::new_v4()));
    std::fs::write(&temp_file, &wav_bytes)
        .map_err(|e| format!("Failed to write temp WAV file: {}", e))?;

    tracing::info!(
        "[dictation] WAV written to {:?} ({} bytes)",
        temp_file,
        wav_bytes.len()
    );

    // Route through the explicitly selected mode adapter, never a fallback.
    let settings = voice_state.settings.lock().await;
    let effective_settings = VoiceSettings {
        provider: match mode {
            TranscriptionMode::Local => VoiceProvider::Local,
            TranscriptionMode::Managed | TranscriptionMode::ByokOpenai => VoiceProvider::Cloud,
        },
        model: settings.model.clone(),
        language: if language.is_empty() {
            settings.language.clone()
        } else {
            Some(language.clone())
        },
    };
    drop(settings);

    let transcription = match mode {
        TranscriptionMode::Managed => {
            transcribe_with_cloud(&temp_file, &effective_settings, &voice_state.client).await
        }
        TranscriptionMode::Local => {
            let local_whisper = voice_state.local_whisper.read().await;
            transcribe_with_local_whisper(
                &temp_file,
                &local_whisper,
                effective_settings.language.clone(),
            )
            .await
        }
        TranscriptionMode::ByokOpenai => {
            let api_key = {
                let svc = settings_state
                    .service
                    .lock()
                    .map_err(|e| format!("Failed to lock settings service: {}", e))?;
                svc.get_api_key("openai").unwrap_or_default()
            };
            if api_key.is_empty() {
                // BYOK without a key fails closed, the audio must never be
                // silently rerouted to managed cloud.
                Err(crate::features::speech::dictation::missing_byok_openai_key_error())
            } else {
                transcribe_with_openai_direct(
                    &temp_file,
                    &effective_settings,
                    &voice_state.client,
                    &api_key,
                )
                .await
            }
        }
    };

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_file);

    match transcription {
        Ok(vt) => {
            tracing::info!(
                "[dictation] Transcription complete: {} chars",
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
            tracing::error!("[dictation] Transcription failed: {}", e);
            Err(format!("Transcription failed: {}", e))
        }
    }
}

/// DESK-17. The transcription endpoint, its multipart fields, and the model
/// were retyped here and again in `apps/cli/src/voice.rs`, so a provider change
/// could land in one binary and silently miss the other. Both now read
/// `agiworkforce_llm::speech` and the `voice_transcription` routing slot.
#[cfg(test)]
mod shared_speech_contract_tests {
    use super::*;

    fn settings(language: Option<&str>) -> VoiceSettings {
        VoiceSettings {
            provider: VoiceProvider::Cloud,
            model: default_cloud_stt_model(),
            language: language.map(str::to_string),
        }
    }

    #[test]
    fn the_transcription_endpoints_are_not_retyped_in_this_binary() {
        let source = include_str!("voice.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        assert!(
            !production.contains("api.openai.com"),
            "the BYOK endpoint must come from agiworkforce_llm::speech"
        );
        assert!(
            !production.contains("/api/llm/v1/audio/transcriptions"),
            "the managed endpoint path must come from agiworkforce_llm::speech"
        );
        assert!(production.contains("speech::OPENAI_TRANSCRIPTIONS_URL"));
        assert!(production.contains("speech::managed_transcriptions_url"));
    }

    #[test]
    fn the_default_model_comes_from_the_shared_routing_slot() {
        let slot = agiworkforce_model_registry::slot_model(speech::TRANSCRIPTION_ROUTING_SLOT)
            .expect("generated registry should load")
            .expect("the voice transcription slot must resolve");
        assert!(!slot.provider_model_id.is_empty());
        assert_eq!(default_cloud_stt_model(), slot.provider_model_id);
    }

    #[test]
    fn the_request_carries_the_shared_fields() {
        let request = transcription_request(&settings(Some("en")));
        assert_eq!(request.model, default_cloud_stt_model());
        assert_eq!(request.response_format, TranscriptionResponseFormat::Json);
        assert!(request
            .text_fields()
            .contains(&("language", "en".to_string())));

        let without_language = transcription_request(&settings(None));
        assert!(!without_language
            .text_fields()
            .iter()
            .any(|(field, _)| *field == "language"));
    }

    #[test]
    fn the_managed_url_is_built_from_the_shared_path() {
        assert_eq!(
            speech::managed_transcriptions_url("https://example.invalid"),
            format!(
                "https://example.invalid/{}",
                speech::MANAGED_TRANSCRIPTIONS_PATH
            )
        );
    }
}

#[cfg(test)]
mod tts_availability_tests {
    use super::*;

    /// THE regression. `TtsConfig::default()`, System provider, no api key.
    /// is what every user who never opened voice settings runs. On Windows and
    /// Linux `SystemTts` cannot speak a word, yet `voice_get_capabilities`
    /// reported `tts_available: true`, so Settings > Voice printed
    /// "TTS: System". Reproducible from any host because platform support is a
    /// parameter.
    #[test]
    fn system_provider_is_unavailable_where_the_platform_cannot_speak() {
        let config = TtsConfig::default();
        assert!(matches!(config.provider, TtsProvider::System));
        assert!(
            !tts_provider_available(&config, false),
            "System TTS must not report available on a platform with no speak arm"
        );
    }

    #[test]
    fn system_provider_is_available_where_the_platform_can_speak() {
        assert!(tts_provider_available(&TtsConfig::default(), true));
    }

    /// Selecting System must never be self-certifying: an api key belonging to
    /// a network provider does not teach the OS synthesiser new platforms. The
    /// old expression `api_key.is_some() || matches!(provider, System)` passed
    /// this for the wrong reason on both arms.
    #[test]
    fn an_api_key_does_not_make_system_tts_available() {
        let config = TtsConfig {
            provider: TtsProvider::System,
            api_key: Some("sk-irrelevant-to-the-os-synthesiser".to_string()),
            ..TtsConfig::default()
        };
        assert!(!tts_provider_available(&config, false));
    }

    /// Network providers require a key, and providers absent from the canonical
    /// catalog additionally require an explicit runtime model identifier.
    #[test]
    fn network_providers_fail_closed_without_required_runtime_configuration() {
        let openai = TtsConfig {
            provider: TtsProvider::OpenAi,
            api_key: Some("fixture-key".to_string()),
            ..TtsConfig::default()
        };
        assert!(tts_provider_available(&openai, false));

        let elevenlabs_without_model = TtsConfig {
            provider: TtsProvider::ElevenLabs,
            api_key: Some("fixture-key".to_string()),
            ..TtsConfig::default()
        };
        assert!(!tts_provider_available(&elevenlabs_without_model, true));

        let elevenlabs_with_model = TtsConfig {
            model_id: Some("fixture-elevenlabs-tts".to_string()),
            ..elevenlabs_without_model
        };
        assert!(tts_provider_available(&elevenlabs_with_model, false));
    }

    /// The production call site must pass the real platform fact. If someone
    /// hardcodes `true` there, this test still passes, so it is pinned by the
    /// adapter-level test in `features::speech::tts` instead. What this pins is
    /// that the two agree for the config the command actually reads.
    #[test]
    fn production_capability_matches_the_adapter_on_this_host() {
        assert_eq!(
            tts_provider_available(&TtsConfig::default(), SystemTts::platform_supported()),
            SystemTts::platform_supported()
        );
    }
}

#[cfg(test)]
mod wake_event_tests {
    use super::*;

    fn detector(phrases: &[&str]) -> VoiceWake {
        VoiceWake::new(WakeWordConfig {
            enabled: true,
            wake_phrases: phrases.iter().map(|p| p.to_string()).collect(),
            ..WakeWordConfig::default()
        })
    }

    fn report(phrase: &str) -> WakeWordEvent {
        WakeWordEvent {
            phrase_detected: phrase.to_string(),
            confidence: 0.0,
            timestamp: 1,
        }
    }

    /// The receiver returned by `VoiceWake::start` used to be dropped on the
    /// spot (`wake.start().await.map(|_| ())`), so a detected phrase reached
    /// nothing. A match must now produce a `wake:event` payload naming the
    /// configured phrase, which is what the webview listens for.
    #[test]
    fn a_matched_phrase_becomes_a_detected_event() {
        let payload = wake_detection_payload(&detector(&["Hey AGI"]), &report("hey agi open chat"))
            .expect("a spoken wake phrase must produce an event");

        assert_eq!(payload.kind, "detected");
        assert_eq!(payload.phrase.as_deref(), Some("Hey AGI"));
        assert_eq!(payload.version, WAKE_EVENT_VERSION);
    }

    /// The VAD loop reports plain voice activity as the literal marker
    /// `speech_detected`. Forwarding that as a trigger would open dictation on
    /// any noise, so it must classify as no match.
    #[test]
    fn bare_voice_activity_is_not_a_wake_phrase() {
        assert!(wake_detection_payload(
            &detector(&["Hey AGI", "OK AGI", "AGI"]),
            &report("speech_detected")
        )
        .is_none());
    }

    /// The capability probe is the reason `voice_wake_enable` refuses instead
    /// of opening the microphone. It may only be flipped by the change that
    /// teaches the detection loop to transcribe.
    #[test]
    fn wake_phrase_detection_is_gated_until_the_detector_transcribes() {
        assert!(!wake_phrase_detection_available());
    }
}
