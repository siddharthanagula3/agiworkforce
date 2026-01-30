//! Barge-in detection for interrupting TTS playback
//!
//! This module provides barge-in detection that monitors microphone input while
//! TTS is playing and can interrupt playback when the user starts speaking.
//!
//! The goal is to detect user speech within 200ms and stop TTS playback,
//! providing a more natural conversational experience.
//!
//! # Architecture
//!
//! ```text
//! TTS Playback Started
//!         |
//!         v
//!   BargeInDetector::start_monitoring()
//!         |
//!         v
//!   [Microphone] -> [VAD] -> Speech Detected?
//!         |                        |
//!         |                   Yes (> min_speech_ms)
//!         |                        |
//!         v                        v
//!   Continue monitoring    on_barge_in callback
//!                                  |
//!                                  v
//!                          Stop TTS Playback
//! ```
//!
//! # Example
//!
//! ```ignore
//! use agiworkforce_desktop::features::speech::barge_in::{BargeInDetector, BargeInConfig};
//!
//! let detector = BargeInDetector::new(vad, BargeInConfig::default())?;
//! let handle = detector.start_monitoring(|| {
//!     // Stop TTS playback
//!     tts_player.stop();
//! }).await?;
//!
//! // Later, when TTS finishes naturally
//! handle.stop();
//! ```

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
#[cfg(feature = "vad")]
use std::time::Duration;
use std::time::Instant;

#[cfg(feature = "vad")]
use super::vad::{AudioResampler, SharedVad, VAD_CHUNK_SIZE};

#[cfg(feature = "vad")]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

/// Configuration for barge-in detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BargeInConfig {
    /// Sensitivity of barge-in detection (0.0 - 1.0)
    /// Higher values = more sensitive (easier to trigger)
    pub sensitivity: f32,
    /// Minimum speech duration (ms) to trigger barge-in
    /// Default: 100ms to avoid false triggers from brief sounds
    pub min_speech_ms: u32,
    /// Audio input device name (None = default)
    pub audio_device: Option<String>,
    /// Number of consecutive speech frames needed to confirm barge-in
    /// Helps reduce false positives from sudden noises
    pub consecutive_frames_threshold: u32,
}

impl Default for BargeInConfig {
    fn default() -> Self {
        Self {
            sensitivity: 0.5,
            min_speech_ms: 100,
            audio_device: None,
            consecutive_frames_threshold: 3,
        }
    }
}

/// Event emitted when barge-in is detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BargeInEvent {
    /// Timestamp when barge-in was detected (Unix millis)
    pub timestamp: i64,
    /// Duration of detected speech before triggering (ms)
    pub speech_duration_ms: u64,
    /// Detection latency from first speech frame (ms)
    pub detection_latency_ms: u64,
}

/// Handle to control active barge-in monitoring
#[derive(Clone)]
pub struct BargeInHandle {
    /// Flag to signal the monitoring thread to stop
    is_active: Arc<AtomicBool>,
    /// Timestamp when monitoring started
    start_time: Instant,
}

impl BargeInHandle {
    /// Create a new handle
    #[cfg(any(feature = "vad", test))]
    #[allow(dead_code)]
    pub(crate) fn new(is_active: Arc<AtomicBool>) -> Self {
        Self {
            is_active,
            start_time: Instant::now(),
        }
    }

    /// Stop monitoring for barge-in
    pub fn stop(&self) {
        self.is_active.store(false, Ordering::SeqCst);
        tracing::debug!(
            "Barge-in monitoring stopped after {:?}",
            self.start_time.elapsed()
        );
    }

    /// Check if monitoring is still active
    pub fn is_active(&self) -> bool {
        self.is_active.load(Ordering::SeqCst)
    }
}

/// Barge-in detector that monitors for speech during TTS playback
///
/// Uses VAD (Voice Activity Detection) to detect when the user starts
/// speaking and triggers a callback to interrupt TTS playback.
pub struct BargeInDetector {
    #[cfg(feature = "vad")]
    vad: SharedVad,
    #[allow(dead_code)]
    config: BargeInConfig,
    /// Flag indicating if detection is currently enabled globally
    #[allow(dead_code)]
    enabled: Arc<AtomicBool>,
    /// Statistics: total barge-ins detected
    #[allow(dead_code)]
    total_detections: Arc<AtomicU64>,
    /// Statistics: average detection latency (ms)
    #[allow(dead_code)]
    avg_latency_ms: Arc<AtomicU64>,
}

impl BargeInDetector {
    /// Create a new barge-in detector
    ///
    /// # Arguments
    /// * `vad` - Shared VAD instance for voice activity detection
    /// * `config` - Configuration for barge-in detection
    ///
    /// # Returns
    /// A new BargeInDetector ready for monitoring
    #[cfg(feature = "vad")]
    pub fn new(vad: SharedVad, config: BargeInConfig) -> Result<Self> {
        Ok(Self {
            vad,
            config,
            enabled: Arc::new(AtomicBool::new(true)),
            total_detections: Arc::new(AtomicU64::new(0)),
            avg_latency_ms: Arc::new(AtomicU64::new(0)),
        })
    }

    /// Create a new barge-in detector with default configuration
    #[cfg(feature = "vad")]
    pub fn with_defaults(vad: SharedVad) -> Result<Self> {
        Self::new(vad, BargeInConfig::default())
    }

    /// Set sensitivity (0.0 - 1.0)
    #[cfg(feature = "vad")]
    pub fn set_sensitivity(&mut self, sensitivity: f32) {
        self.config.sensitivity = sensitivity.clamp(0.0, 1.0);
    }

    /// Get current sensitivity
    #[cfg(feature = "vad")]
    pub fn sensitivity(&self) -> f32 {
        self.config.sensitivity
    }

    /// Set minimum speech duration for triggering (ms)
    #[cfg(feature = "vad")]
    pub fn set_min_speech_ms(&mut self, min_ms: u32) {
        self.config.min_speech_ms = min_ms;
    }

    /// Get minimum speech duration
    #[cfg(feature = "vad")]
    pub fn min_speech_ms(&self) -> u32 {
        self.config.min_speech_ms
    }

    /// Enable or disable barge-in detection globally
    #[cfg(feature = "vad")]
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
    }

    /// Check if barge-in detection is enabled
    #[cfg(feature = "vad")]
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Get detection statistics
    #[cfg(feature = "vad")]
    pub fn stats(&self) -> BargeInStats {
        BargeInStats {
            total_detections: self.total_detections.load(Ordering::Relaxed),
            avg_latency_ms: self.avg_latency_ms.load(Ordering::Relaxed),
        }
    }

    /// Check if a single audio chunk indicates barge-in
    ///
    /// This is a synchronous check for use in tight audio processing loops.
    /// For full barge-in detection with timing, use `start_monitoring`.
    #[cfg(feature = "vad")]
    pub fn check_barge_in(&self, audio: &[f32]) -> bool {
        if !self.is_enabled() {
            return false;
        }

        // Use blocking VAD call for synchronous check
        self.vad.is_speech_f32_blocking(audio).unwrap_or(false)
    }

    /// Start monitoring for barge-in while TTS is playing
    ///
    /// This spawns a dedicated thread that captures microphone input and
    /// monitors for speech using VAD. When speech is detected for longer
    /// than `min_speech_ms`, the callback is invoked.
    ///
    /// # Arguments
    /// * `on_barge_in` - Callback invoked when barge-in is detected
    ///
    /// # Returns
    /// A handle that can be used to stop monitoring
    #[cfg(feature = "vad")]
    pub fn start_monitoring<F>(&self, on_barge_in: F) -> Result<BargeInHandle>
    where
        F: Fn(BargeInEvent) + Send + 'static,
    {
        if !self.is_enabled() {
            return Err(Error::Config("Barge-in detection is disabled".into()));
        }

        let is_active = Arc::new(AtomicBool::new(true));
        let handle = BargeInHandle::new(is_active.clone());

        let config = self.config.clone();
        let vad = self.vad.clone();
        let total_detections = self.total_detections.clone();
        let avg_latency_ms = self.avg_latency_ms.clone();

        // Spawn monitoring on a dedicated thread (cpal::Stream is not Send)
        std::thread::Builder::new()
            .name("barge-in-monitor".to_string())
            .spawn(move || {
                if let Err(e) = Self::monitoring_loop(
                    config,
                    vad,
                    is_active,
                    on_barge_in,
                    total_detections,
                    avg_latency_ms,
                ) {
                    tracing::error!("Barge-in monitoring error: {}", e);
                }
            })
            .map_err(|e| {
                Error::Config(format!("Failed to spawn barge-in monitor thread: {}", e))
            })?;

        Ok(handle)
    }

    /// Internal monitoring loop that runs on a dedicated thread
    #[cfg(feature = "vad")]
    fn monitoring_loop<F>(
        config: BargeInConfig,
        vad: SharedVad,
        is_active: Arc<AtomicBool>,
        on_barge_in: F,
        total_detections: Arc<AtomicU64>,
        avg_latency_ms: Arc<AtomicU64>,
    ) -> Result<()>
    where
        F: Fn(BargeInEvent) + Send + 'static,
    {
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
        tracing::debug!("Barge-in monitoring using audio device: {}", device_name);

        let supported_config = device
            .default_input_config()
            .map_err(|e| Error::Config(format!("Failed to get device config: {}", e)))?;

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels() as usize;

        // Create resampler if needed
        let resampler = AudioResampler::new(sample_rate);
        let samples_needed = resampler.source_samples_for_target(VAD_CHUNK_SIZE);

        // Audio buffer channel
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

                    // Non-blocking send
                    let _ = audio_tx.send(mono);
                },
                move |err| {
                    tracing::error!("Barge-in audio stream error: {}", err);
                },
                None,
            )
            .map_err(|e| Error::Config(format!("Failed to build audio stream: {}", e)))?;

        stream
            .play()
            .map_err(|e| Error::Config(format!("Failed to start audio stream: {}", e)))?;

        tracing::debug!("Barge-in monitoring started");

        // Detection state
        let mut audio_buffer: Vec<f32> = Vec::new();
        let mut speech_start: Option<Instant> = None;
        let mut consecutive_speech_frames: u32 = 0;
        let mut barge_in_triggered = false;

        // Calculate min speech duration threshold
        let min_speech_duration = Duration::from_millis(config.min_speech_ms as u64);

        // Monitoring loop with short timeout for responsiveness
        while is_active.load(Ordering::SeqCst) && !barge_in_triggered {
            // Collect audio with short timeout for quick response
            match audio_rx.recv_timeout(Duration::from_millis(10)) {
                Ok(samples) => {
                    audio_buffer.extend(samples);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Continue processing existing buffer
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }

            // Process complete chunks
            while audio_buffer.len() >= samples_needed && !barge_in_triggered {
                let chunk: Vec<f32> = audio_buffer.drain(..samples_needed).collect();
                let resampled = resampler.resample(&chunk);

                // Ensure correct VAD chunk size
                let vad_chunk: Vec<f32> = if resampled.len() >= VAD_CHUNK_SIZE {
                    resampled[..VAD_CHUNK_SIZE].to_vec()
                } else {
                    let mut padded = resampled;
                    padded.resize(VAD_CHUNK_SIZE, 0.0);
                    padded
                };

                // Run VAD
                let is_speech = vad.is_speech_f32_blocking(&vad_chunk).unwrap_or(false);

                if is_speech {
                    consecutive_speech_frames += 1;

                    // Mark speech start time
                    if speech_start.is_none() {
                        speech_start = Some(Instant::now());
                        tracing::debug!("Barge-in: potential speech detected");
                    }

                    // Check if we've met the thresholds
                    if consecutive_speech_frames >= config.consecutive_frames_threshold {
                        if let Some(start) = speech_start {
                            let speech_duration = start.elapsed();

                            if speech_duration >= min_speech_duration {
                                // Barge-in confirmed!
                                let detection_latency = start.elapsed();

                                tracing::info!(
                                    "Barge-in detected! Speech duration: {:?}, Latency: {:?}",
                                    speech_duration,
                                    detection_latency
                                );

                                // Update statistics
                                let count = total_detections.fetch_add(1, Ordering::Relaxed) + 1;
                                let latency_ms = detection_latency.as_millis() as u64;

                                // Running average
                                let prev_avg = avg_latency_ms.load(Ordering::Relaxed);
                                let new_avg = if count == 1 {
                                    latency_ms
                                } else {
                                    (prev_avg * (count - 1) + latency_ms) / count
                                };
                                avg_latency_ms.store(new_avg, Ordering::Relaxed);

                                // Create event
                                let event = BargeInEvent {
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                    speech_duration_ms: speech_duration.as_millis() as u64,
                                    detection_latency_ms: latency_ms,
                                };

                                // Trigger callback
                                on_barge_in(event);
                                barge_in_triggered = true;
                            }
                        }
                    }
                } else {
                    // Reset if silence detected
                    if consecutive_speech_frames > 0 {
                        tracing::debug!(
                            "Barge-in: speech ended after {} frames",
                            consecutive_speech_frames
                        );
                    }
                    consecutive_speech_frames = 0;
                    speech_start = None;
                }
            }
        }

        drop(stream);
        tracing::debug!("Barge-in monitoring stopped");
        Ok(())
    }
}

/// Stub implementation when VAD feature is disabled
#[cfg(not(feature = "vad"))]
impl BargeInDetector {
    pub fn new(_config: BargeInConfig) -> Result<Self> {
        Err(Error::Config(
            "VAD feature is not enabled. Rebuild with --features vad".to_string(),
        ))
    }

    pub fn set_sensitivity(&mut self, _sensitivity: f32) {}

    pub fn sensitivity(&self) -> f32 {
        0.0
    }

    pub fn set_min_speech_ms(&mut self, _min_ms: u32) {}

    pub fn min_speech_ms(&self) -> u32 {
        0
    }

    pub fn set_enabled(&self, _enabled: bool) {}

    pub fn is_enabled(&self) -> bool {
        false
    }

    pub fn stats(&self) -> BargeInStats {
        BargeInStats {
            total_detections: 0,
            avg_latency_ms: 0,
        }
    }

    pub fn check_barge_in(&self, _audio: &[f32]) -> bool {
        false
    }

    pub fn start_monitoring<F>(&self, _on_barge_in: F) -> Result<BargeInHandle>
    where
        F: Fn(BargeInEvent) + Send + 'static,
    {
        Err(Error::Config(
            "VAD feature is not enabled. Rebuild with --features vad".to_string(),
        ))
    }
}

/// Statistics for barge-in detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BargeInStats {
    /// Total number of barge-ins detected
    pub total_detections: u64,
    /// Average detection latency in milliseconds
    pub avg_latency_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = BargeInConfig::default();
        assert!((config.sensitivity - 0.5).abs() < f32::EPSILON);
        assert_eq!(config.min_speech_ms, 100);
        assert!(config.audio_device.is_none());
        assert_eq!(config.consecutive_frames_threshold, 3);
    }

    #[test]
    #[cfg(feature = "vad")]
    fn test_barge_in_handle() {
        let is_active = Arc::new(AtomicBool::new(true));
        let handle = BargeInHandle::new(is_active.clone());

        assert!(handle.is_active());
        handle.stop();
        assert!(!handle.is_active());
    }

    #[test]
    fn test_barge_in_stats_default() {
        let stats = BargeInStats {
            total_detections: 0,
            avg_latency_ms: 0,
        };
        assert_eq!(stats.total_detections, 0);
        assert_eq!(stats.avg_latency_ms, 0);
    }

    #[test]
    fn test_barge_in_event_serialization() {
        let event = BargeInEvent {
            timestamp: 1234567890,
            speech_duration_ms: 150,
            detection_latency_ms: 85,
        };

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: BargeInEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.timestamp, event.timestamp);
        assert_eq!(deserialized.speech_duration_ms, event.speech_duration_ms);
        assert_eq!(
            deserialized.detection_latency_ms,
            event.detection_latency_ms
        );
    }
}
