//! Voice Wake word detection with WebRTC VAD integration
//!
//! This module provides wake word detection for hands-free voice interaction.
//! It uses WebRTC VAD for voice activity detection, then transcribes
//! detected speech and matches against configured wake phrases.
//!
//! # Architecture
//!
//! ```text
//! Microphone -> Audio Capture (cpal) -> Resampler -> VAD -> Speech Buffer
//!                                                              |
//!                                                              v
//!                                         Transcription <- Speech End Detection
//!                                              |
//!                                              v
//!                                       Wake Phrase Matching -> Event
//! ```

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

#[cfg(feature = "vad")]
use super::vad::{AudioResampler, SharedVad, VadMode, VAD_CHUNK_SIZE};

#[cfg(feature = "vad")]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

/// Wake word detection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeWordConfig {
    /// Enable/disable wake word detection
    pub enabled: bool,
    /// List of wake phrases to detect
    pub wake_phrases: Vec<String>,
    /// Fuzzy matching sensitivity (0.0 - 1.0)
    pub sensitivity: f32,
    /// Specific audio input device (None = default)
    pub audio_device: Option<String>,
    /// VAD speech detection threshold (0.0 - 1.0)
    pub vad_threshold: f32,
    /// Silence duration (ms) before considering speech ended
    pub silence_duration_ms: u64,
    /// Minimum speech duration (ms) to consider valid
    pub min_speech_duration_ms: u64,
    /// Maximum speech duration (ms) before forcing transcription
    pub max_speech_duration_ms: u64,
}

impl Default for WakeWordConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            wake_phrases: vec![
                "Hey AGI".to_string(),
                "OK AGI".to_string(),
                "AGI".to_string(),
            ],
            sensitivity: 0.5,
            audio_device: None,
            vad_threshold: 0.5,
            silence_duration_ms: 500,
            min_speech_duration_ms: 200,
            max_speech_duration_ms: 5000,
        }
    }
}

/// Event emitted when wake word is detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeWordEvent {
    pub phrase_detected: String,
    pub confidence: f32,
    pub timestamp: i64,
}

/// Internal state for speech detection
#[cfg(feature = "vad")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpeechState {
    /// Waiting for speech to start
    Idle,
    /// Speech detected, buffering audio
    Speaking,
    /// Possible end of speech, waiting for confirmation
    PossibleEnd,
}

/// Voice Wake detector using VAD (Voice Activity Detection)
///
/// Uses WebRTC VAD for speech detection, then transcribes
/// detected speech and matches against configured wake phrases.
pub struct VoiceWake {
    config: WakeWordConfig,
    is_listening: Arc<AtomicBool>,
    event_tx: Option<mpsc::Sender<WakeWordEvent>>,
    #[cfg(feature = "vad")]
    vad: Option<SharedVad>,
}

impl VoiceWake {
    /// Create a new VoiceWake instance
    pub fn new(config: WakeWordConfig) -> Self {
        Self {
            config,
            is_listening: Arc::new(AtomicBool::new(false)),
            event_tx: None,
            #[cfg(feature = "vad")]
            vad: None,
        }
    }

    /// Initialize the VAD (WebRTC VAD doesn't require model downloads)
    #[cfg(feature = "vad")]
    pub async fn init_vad(&mut self) -> Result<()> {
        // Convert vad_threshold (0.0-1.0) to VadMode (0-3)
        let mode = if self.config.vad_threshold < 0.25 {
            VadMode::Quality
        } else if self.config.vad_threshold < 0.5 {
            VadMode::LowBitrate
        } else if self.config.vad_threshold < 0.75 {
            VadMode::Aggressive
        } else {
            VadMode::VeryAggressive
        };

        let vad = SharedVad::new(super::vad::VAD_SAMPLE_RATE, mode)?;
        self.vad = Some(vad);

        tracing::info!("VAD initialized successfully");
        Ok(())
    }

    /// Set event sender for wake word detection
    pub fn set_event_sender(&mut self, tx: mpsc::Sender<WakeWordEvent>) {
        self.event_tx = Some(tx);
    }

    /// Start listening for wake word
    pub async fn start(&self) -> Result<mpsc::Receiver<WakeWordEvent>> {
        if !self.config.enabled {
            return Err(Error::Config("Wake word detection is disabled".into()));
        }

        let (tx, rx) = mpsc::channel(10);
        let is_listening = self.is_listening.clone();
        let config = self.config.clone();

        is_listening.store(true, Ordering::SeqCst);

        #[cfg(feature = "vad")]
        {
            let vad = self.vad.clone().ok_or_else(|| {
                Error::Config("VAD not initialized. Call init_vad() first.".to_string())
            })?;

            // Spawn detection on a dedicated OS thread since cpal::Stream is not Send
            // The thread communicates back via a sync channel
            std::thread::Builder::new()
                .name("vad-detection".to_string())
                .spawn(move || {
                    if let Err(e) =
                        Self::detection_loop_with_vad_sync(config, is_listening, tx, vad)
                    {
                        tracing::error!("VAD detection loop error: {}", e);
                    }
                })
                .map_err(|e| {
                    Error::Config(format!("Failed to spawn VAD detection thread: {}", e))
                })?;
        }

        #[cfg(not(feature = "vad"))]
        {
            // Spawn fallback detection task
            tokio::spawn(async move {
                Self::detection_loop_fallback(config, is_listening, tx).await;
            });
        }

        Ok(rx)
    }

    /// Detection loop with real VAD integration (synchronous version for dedicated thread)
    ///
    /// This runs on a dedicated OS thread since cpal::Stream is not Send.
    /// It uses blocking VAD calls and std::sync::mpsc for audio buffering.
    #[cfg(feature = "vad")]
    fn detection_loop_with_vad_sync(
        config: WakeWordConfig,
        is_listening: Arc<AtomicBool>,
        tx: mpsc::Sender<WakeWordEvent>,
        vad: SharedVad,
    ) -> Result<()> {
        use std::time::{Duration, Instant};

        // Set up audio capture
        let host = cpal::default_host();
        let device = match &config.audio_device {
            Some(name) => host
                .input_devices()
                .map_err(|e| Error::Config(format!("Failed to enumerate audio devices: {}", e)))?
                .find(|d| d.name().map(|n| n == *name).unwrap_or(false))
                .ok_or_else(|| Error::Config(format!("Audio device '{}' not found", name)))?,
            None => host
                .default_input_device()
                .ok_or_else(|| Error::Config("No default audio input device".to_string()))?,
        };

        let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
        tracing::info!("Using audio device: {}", device_name);

        let supported_config = device
            .default_input_config()
            .map_err(|e| Error::Config(format!("Failed to get device config: {}", e)))?;

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels() as usize;
        tracing::info!("Audio config: {} Hz, {} channels", sample_rate, channels);

        // Create resampler if needed
        let resampler = AudioResampler::new(sample_rate);
        let samples_needed = resampler.source_samples_for_target(VAD_CHUNK_SIZE);

        // Audio buffer channel (using std::sync::mpsc for the audio thread)
        let (audio_tx, audio_rx) = std::sync::mpsc::channel::<Vec<f32>>();

        // Build audio stream
        let stream = device
            .build_input_stream(
                &supported_config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    // Convert to mono if stereo
                    let mono: Vec<f32> = if channels > 1 {
                        data.chunks(channels)
                            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                            .collect()
                    } else {
                        data.to_vec()
                    };

                    // Send to processing (non-blocking best effort)
                    let _ = audio_tx.send(mono);
                },
                move |err| {
                    tracing::error!("Audio stream error: {}", err);
                },
                None,
            )
            .map_err(|e| Error::Config(format!("Failed to build audio stream: {}", e)))?;

        stream
            .play()
            .map_err(|e| Error::Config(format!("Failed to start audio stream: {}", e)))?;

        tracing::info!("Audio capture started, listening for wake words...");

        // AUDIT-004-007 fix: Add maximum buffer size limits (16MB max for speech, 1MB for audio)
        // At 16kHz sample rate with f32 (4 bytes), 16MB = ~1 million samples = ~62 seconds
        const MAX_SPEECH_BUFFER_SAMPLES: usize = 1_000_000;
        // Audio buffer needs less since it's processed incrementally
        const MAX_AUDIO_BUFFER_SAMPLES: usize = 250_000;

        // Speech detection state
        let mut state = SpeechState::Idle;
        let mut speech_buffer: Vec<f32> = Vec::new();
        let mut audio_buffer: Vec<f32> = Vec::new();
        let mut speech_start_time: Option<Instant> = None;
        let mut last_speech_time: Option<Instant> = None;

        // VAD processing loop
        while is_listening.load(Ordering::SeqCst) {
            // Collect audio samples with timeout
            match audio_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(samples) => {
                    // AUDIT-004-007 fix: Check buffer size before extending
                    if audio_buffer.len() + samples.len() <= MAX_AUDIO_BUFFER_SAMPLES {
                        audio_buffer.extend(samples);
                    } else {
                        tracing::warn!(
                            "AUDIT-004-007: Audio buffer limit reached ({} samples), dropping new audio",
                            MAX_AUDIO_BUFFER_SAMPLES
                        );
                        // Clear buffer to recover
                        audio_buffer.clear();
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Timeout, continue to check for silence
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // Channel closed
                    break;
                }
            }

            // Process complete chunks
            while audio_buffer.len() >= samples_needed {
                let chunk: Vec<f32> = audio_buffer.drain(..samples_needed).collect();
                let resampled = resampler.resample(&chunk);

                // Ensure we have exactly VAD_CHUNK_SIZE samples
                let vad_chunk: Vec<f32> = if resampled.len() >= VAD_CHUNK_SIZE {
                    resampled[..VAD_CHUNK_SIZE].to_vec()
                } else {
                    let mut padded = resampled;
                    padded.resize(VAD_CHUNK_SIZE, 0.0);
                    padded
                };

                // Run VAD (using blocking f32 call)
                let is_speech = vad.is_speech_f32_blocking(&vad_chunk).unwrap_or(false);
                let now = Instant::now();

                match state {
                    SpeechState::Idle => {
                        if is_speech {
                            state = SpeechState::Speaking;
                            speech_start_time = Some(now);
                            last_speech_time = Some(now);
                            speech_buffer.clear();
                            speech_buffer.extend(&vad_chunk);
                            tracing::debug!("Speech started");
                        }
                    }
                    SpeechState::Speaking => {
                        // AUDIT-004-007 fix: Check speech buffer size before extending
                        if speech_buffer.len() + vad_chunk.len() <= MAX_SPEECH_BUFFER_SAMPLES {
                            speech_buffer.extend(&vad_chunk);
                        } else {
                            tracing::warn!(
                                "AUDIT-004-007: Speech buffer limit reached ({} samples), forcing end",
                                MAX_SPEECH_BUFFER_SAMPLES
                            );
                            state = SpeechState::PossibleEnd;
                        }

                        if is_speech {
                            last_speech_time = Some(now);
                        }

                        // Check for max duration
                        if let Some(start) = speech_start_time {
                            if now.duration_since(start).as_millis() as u64
                                > config.max_speech_duration_ms
                            {
                                tracing::debug!("Max speech duration reached");
                                state = SpeechState::PossibleEnd;
                            }
                        }

                        // Check for silence
                        if !is_speech {
                            state = SpeechState::PossibleEnd;
                        }
                    }
                    SpeechState::PossibleEnd => {
                        if is_speech {
                            // False alarm, continue recording
                            state = SpeechState::Speaking;
                            last_speech_time = Some(now);
                            // AUDIT-004-007 fix: Check buffer size before extending
                            if speech_buffer.len() + vad_chunk.len() <= MAX_SPEECH_BUFFER_SAMPLES {
                                speech_buffer.extend(&vad_chunk);
                            }
                            // If buffer is full, we stay in PossibleEnd and will process soon
                        } else if let Some(last) = last_speech_time {
                            let silence_duration = now.duration_since(last).as_millis() as u64;

                            if silence_duration >= config.silence_duration_ms {
                                // End of speech confirmed
                                let speech_duration = speech_start_time
                                    .map(|s| now.duration_since(s).as_millis() as u64)
                                    .unwrap_or(0);

                                if speech_duration >= config.min_speech_duration_ms {
                                    tracing::debug!(
                                        "Speech ended, duration: {}ms, buffer size: {} samples",
                                        speech_duration,
                                        speech_buffer.len()
                                    );

                                    // Process the speech buffer for wake word detection
                                    // In a full implementation, this would:
                                    // 1. Send audio to speech-to-text service
                                    // 2. Match transcription against wake phrases
                                    // 3. Emit event if matched

                                    // For now, emit a placeholder event
                                    // Real implementation would integrate with recognition.rs
                                    // Use blocking_send since we're in a sync context
                                    let _ = tx.blocking_send(WakeWordEvent {
                                        phrase_detected: "speech_detected".to_string(),
                                        confidence: 0.0, // Placeholder
                                        timestamp: chrono::Utc::now().timestamp_millis(),
                                    });
                                }

                                // Reset state
                                state = SpeechState::Idle;
                                speech_buffer.clear();
                                speech_start_time = None;
                                last_speech_time = None;

                                // Reset VAD state for next utterance
                                vad.reset_state_blocking();
                            }
                        }
                    }
                }
            }
        }

        drop(stream);
        tracing::info!("Wake word detection stopped");
        Ok(())
    }

    /// Fallback detection loop when VAD feature is disabled
    #[cfg(not(feature = "vad"))]
    async fn detection_loop_fallback(
        _config: WakeWordConfig,
        is_listening: Arc<AtomicBool>,
        _tx: mpsc::Sender<WakeWordEvent>,
    ) {
        tracing::warn!("VAD feature not enabled, wake word detection is limited");
        while is_listening.load(Ordering::SeqCst) {
            // Sleep to avoid busy loop
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }

    /// Stop listening
    pub fn stop(&self) {
        self.is_listening.store(false, Ordering::SeqCst);
    }

    /// Check if currently listening
    pub fn is_listening(&self) -> bool {
        self.is_listening.load(Ordering::SeqCst)
    }

    /// Update configuration
    pub fn update_config(&mut self, config: WakeWordConfig) {
        self.config = config;
    }

    /// Get current configuration
    pub fn get_config(&self) -> &WakeWordConfig {
        &self.config
    }

    /// Check if phrase matches any wake phrase (fuzzy matching)
    pub fn matches_wake_phrase(&self, phrase: &str) -> Option<(&str, f32)> {
        let phrase_lower = phrase.to_lowercase();

        for wake_phrase in &self.config.wake_phrases {
            let wake_lower = wake_phrase.to_lowercase();

            // Exact match
            if phrase_lower.contains(&wake_lower) {
                return Some((wake_phrase, 1.0));
            }

            // Fuzzy match using simple Levenshtein distance
            let distance = Self::levenshtein(&phrase_lower, &wake_lower);
            let max_len = phrase_lower.len().max(wake_lower.len());
            let similarity = 1.0 - (distance as f32 / max_len as f32);

            if similarity >= self.config.sensitivity {
                return Some((wake_phrase, similarity));
            }
        }

        None
    }

    /// Simple Levenshtein distance
    fn levenshtein(s1: &str, s2: &str) -> usize {
        let v1: Vec<char> = s1.chars().collect();
        let v2: Vec<char> = s2.chars().collect();
        let m = v1.len();
        let n = v2.len();

        if m == 0 {
            return n;
        }
        if n == 0 {
            return m;
        }

        let mut matrix = vec![vec![0usize; n + 1]; m + 1];

        for (i, row) in matrix.iter_mut().enumerate().take(m + 1) {
            row[0] = i;
        }
        for (j, val) in matrix[0].iter_mut().enumerate().take(n + 1) {
            *val = j;
        }

        for i in 1..=m {
            for j in 1..=n {
                let cost = if v1[i - 1] == v2[j - 1] { 0 } else { 1 };
                matrix[i][j] = (matrix[i - 1][j] + 1)
                    .min(matrix[i][j - 1] + 1)
                    .min(matrix[i - 1][j - 1] + cost);
            }
        }

        matrix[m][n]
    }
}

impl Default for VoiceWake {
    fn default() -> Self {
        Self::new(WakeWordConfig::default())
    }
}

/// Information about an available audio input device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    /// Device name
    pub name: String,
    /// Whether this is the default device
    pub is_default: bool,
    /// Sample rate (if available)
    pub sample_rate: Option<u32>,
    /// Number of channels (if available)
    pub channels: Option<u16>,
}

/// List available audio input devices
///
/// # Returns
/// A list of available audio input devices with their properties
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>> {
    #[cfg(feature = "vad")]
    {
        use cpal::traits::{DeviceTrait, HostTrait};

        let host = cpal::default_host();
        let default_device = host.default_input_device();
        let default_name = default_device.as_ref().and_then(|d| d.name().ok());

        let devices = host
            .input_devices()
            .map_err(|e| Error::Config(format!("Failed to enumerate audio devices: {}", e)))?;

        let mut result = Vec::new();
        for device in devices {
            let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
            let is_default = default_name.as_ref().map(|n| n == &name).unwrap_or(false);

            let (sample_rate, channels) = device
                .default_input_config()
                .map(|c| (Some(c.sample_rate().0), Some(c.channels())))
                .unwrap_or((None, None));

            result.push(AudioDeviceInfo {
                name,
                is_default,
                sample_rate,
                channels,
            });
        }

        Ok(result)
    }

    #[cfg(not(feature = "vad"))]
    {
        Err(Error::Config(
            "VAD feature not enabled, audio device enumeration not available".to_string(),
        ))
    }
}

/// Check if VAD feature is available
pub fn is_vad_available() -> bool {
    cfg!(feature = "vad")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wake_phrase_matching() {
        let wake = VoiceWake::new(WakeWordConfig::default());

        // Exact match
        assert!(wake.matches_wake_phrase("Hey AGI").is_some());
        assert!(wake.matches_wake_phrase("hey agi").is_some());

        // Contains match
        assert!(wake.matches_wake_phrase("Hey AGI, what's up?").is_some());
    }

    #[test]
    fn test_default_config() {
        let config = WakeWordConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.wake_phrases.len(), 3);
        assert!((config.vad_threshold - 0.5).abs() < f32::EPSILON);
        assert_eq!(config.silence_duration_ms, 500);
        assert_eq!(config.min_speech_duration_ms, 200);
        assert_eq!(config.max_speech_duration_ms, 5000);
    }

    #[test]
    fn test_levenshtein_distance() {
        // Same strings
        assert_eq!(VoiceWake::levenshtein("hello", "hello"), 0);

        // Single character difference
        assert_eq!(VoiceWake::levenshtein("hello", "hallo"), 1);

        // Empty strings
        assert_eq!(VoiceWake::levenshtein("", "hello"), 5);
        assert_eq!(VoiceWake::levenshtein("hello", ""), 5);

        // Completely different
        assert_eq!(VoiceWake::levenshtein("abc", "xyz"), 3);
    }

    #[cfg(feature = "vad")]
    #[test]
    fn test_speech_state_enum() {
        let state = SpeechState::Idle;
        assert_eq!(state, SpeechState::Idle);

        let state = SpeechState::Speaking;
        assert_eq!(state, SpeechState::Speaking);

        let state = SpeechState::PossibleEnd;
        assert_eq!(state, SpeechState::PossibleEnd);
    }

    #[test]
    fn test_vad_availability_check() {
        // This will be true or false depending on feature flag
        let _ = is_vad_available();
    }
}
