//! Voice Activity Detection using WebRTC VAD
//!
//! This module provides voice activity detection using the WebRTC VAD library,
//! which is a lightweight and reliable voice activity detector based on GMM
//! (Gaussian Mixture Models).
//!
//! The VAD supports multiple aggressiveness modes:
//! - Mode 0 (Quality): Least aggressive, most speech detected
//! - Mode 1 (LowBitrate): Moderate (default)
//! - Mode 2 (Aggressive): Aggressive
//! - Mode 3 (VeryAggressive): Most aggressive, least false positives
//!
//! # Example
//!
//! ```ignore
//! use agiworkforce_desktop::features::speech::vad::SharedVad;
//!
//! let vad = SharedVad::with_defaults()?;
//! let audio_chunk: Vec<f32> = vec![0.0; 480]; // 30ms at 16kHz
//! let is_speech = vad.is_speech_f32(&audio_chunk).await?;
//! ```

use crate::sys::error::{Error, Result};
use std::path::Path;

/// Audio sample rate expected by VAD (16kHz recommended)
pub const VAD_SAMPLE_RATE: u32 = 16000;

/// Number of samples per chunk (480 samples = 30ms at 16kHz)
/// WebRTC VAD supports 10ms, 20ms, or 30ms frames
pub const VAD_CHUNK_SIZE: usize = 480;

/// Re-export webrtc-vad's VadMode for convenience
#[cfg(feature = "vad")]
pub use webrtc_vad::VadMode;

/// Stub VadMode when feature is disabled
#[cfg(not(feature = "vad"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VadMode {
    Quality,
    #[default]
    LowBitrate,
    Aggressive,
    VeryAggressive,
}

/// WebRTC VAD wrapper for voice activity detection
///
/// This struct wraps the WebRTC VAD library for detecting speech in audio streams.
/// Unlike neural network-based VADs, WebRTC VAD uses GMM (Gaussian Mixture Models)
/// which is faster and doesn't require any model files.
///
/// Note: This type is NOT Send/Sync due to FFI pointers. Use `SharedVad` for
/// thread-safe access via a dedicated worker thread.
#[cfg(feature = "vad")]
pub struct WebRtcVad {
    vad: webrtc_vad::Vad,
    sample_rate: u32,
}

#[cfg(feature = "vad")]
impl WebRtcVad {
    /// Create a new WebRTC VAD instance
    ///
    /// # Arguments
    /// * `sample_rate` - Audio sample rate (8000, 16000, 32000, or 48000 Hz)
    /// * `mode` - VAD aggressiveness mode
    ///
    /// # Returns
    /// A new WebRtcVad instance ready for inference
    ///
    /// # Errors
    /// Returns an error if the sample rate is not supported
    pub fn new(sample_rate: u32, mode: VadMode) -> Result<Self> {
        // Validate and convert sample rate
        let sr = match sample_rate {
            8000 => webrtc_vad::SampleRate::Rate8kHz,
            16000 => webrtc_vad::SampleRate::Rate16kHz,
            32000 => webrtc_vad::SampleRate::Rate32kHz,
            48000 => webrtc_vad::SampleRate::Rate48kHz,
            _ => {
                return Err(Error::Config(format!(
                    "Invalid sample rate {}. Supported: 8000, 16000, 32000, 48000 Hz",
                    sample_rate
                )));
            }
        };

        let vad = webrtc_vad::Vad::new_with_rate_and_mode(sr, mode);

        Ok(Self { vad, sample_rate })
    }

    /// Check if an audio chunk contains speech
    pub fn is_speech(&mut self, audio_chunk: &[i16]) -> Result<bool> {
        self.vad
            .is_voice_segment(audio_chunk)
            .map_err(|_| Error::Config("VAD processing failed: invalid frame size".to_string()))
    }

    /// Check if an audio chunk (f32) contains speech
    pub fn is_speech_f32(&mut self, audio_chunk: &[f32]) -> Result<bool> {
        let i16_chunk: Vec<i16> = audio_chunk
            .iter()
            .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
            .collect();
        self.is_speech(&i16_chunk)
    }

    /// Get the configured sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Get the expected chunk size in samples for 30ms frames
    pub fn chunk_size(&self) -> usize {
        (self.sample_rate as usize * 30) / 1000
    }

    /// Reset the VAD state (not needed for WebRTC VAD)
    pub fn reset_state(&mut self) {
        // WebRTC VAD is stateless
    }
}

/// Reply channel type for async operations
#[cfg(feature = "vad")]
enum ReplyChannel {
    /// Async reply via tokio oneshot
    Async(tokio::sync::oneshot::Sender<Result<bool>>),
    /// Sync reply via std mpsc
    Sync(std::sync::mpsc::Sender<Result<bool>>),
}

/// Command sent to the VAD worker thread
#[cfg(feature = "vad")]
enum VadCommand {
    /// Process i16 audio chunk
    IsSpeechI16(Vec<i16>, ReplyChannel),
    /// Process f32 audio chunk
    IsSpeechF32(Vec<f32>, ReplyChannel),
    /// Reset state
    Reset,
    /// Shutdown
    Shutdown,
}

/// Thread-safe wrapper for WebRtcVad using a dedicated worker thread
///
/// Since WebRTC VAD's internal FFI pointer is not Send-safe, this wrapper
/// spawns a dedicated thread that owns the VAD instance and processes
/// commands via channels.
#[cfg(feature = "vad")]
pub struct SharedVad {
    command_tx: std::sync::mpsc::Sender<VadCommand>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
}

#[cfg(feature = "vad")]
impl SharedVad {
    /// Create a new shared VAD instance
    ///
    /// # Arguments
    /// * `sample_rate` - Audio sample rate (8000, 16000, 32000, or 48000 Hz)
    /// * `mode` - VAD aggressiveness mode
    pub fn new(sample_rate: u32, mode: VadMode) -> Result<Self> {
        let (command_tx, command_rx) = std::sync::mpsc::channel::<VadCommand>();

        // Spawn worker thread that owns the VAD instance
        let worker_handle = std::thread::Builder::new()
            .name("vad-worker".to_string())
            .spawn(move || {
                // Create VAD on the worker thread
                let mut vad = match WebRtcVad::new(sample_rate, mode) {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::error!("Failed to create VAD: {}", e);
                        return;
                    }
                };

                tracing::debug!("VAD worker thread started");

                // Helper to send reply via either channel type
                fn send_reply(channel: ReplyChannel, result: Result<bool>) {
                    match channel {
                        ReplyChannel::Async(tx) => {
                            let _ = tx.send(result);
                        }
                        ReplyChannel::Sync(tx) => {
                            let _ = tx.send(result);
                        }
                    }
                }

                // Process commands
                while let Ok(cmd) = command_rx.recv() {
                    match cmd {
                        VadCommand::IsSpeechI16(chunk, reply_channel) => {
                            let result = vad.is_speech(&chunk);
                            send_reply(reply_channel, result);
                        }
                        VadCommand::IsSpeechF32(chunk, reply_channel) => {
                            let result = vad.is_speech_f32(&chunk);
                            send_reply(reply_channel, result);
                        }
                        VadCommand::Reset => {
                            vad.reset_state();
                        }
                        VadCommand::Shutdown => {
                            tracing::debug!("VAD worker thread shutting down");
                            break;
                        }
                    }
                }
            })
            .map_err(|e| Error::Config(format!("Failed to spawn VAD worker thread: {}", e)))?;

        Ok(Self {
            command_tx,
            worker_handle: Some(worker_handle),
        })
    }

    /// Create with default settings (16kHz, LowBitrate mode)
    pub fn with_defaults() -> Result<Self> {
        Self::new(VAD_SAMPLE_RATE, VadMode::LowBitrate)
    }

    /// Check if audio contains speech (async, i16)
    pub async fn is_speech(&self, audio_chunk: &[i16]) -> Result<bool> {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        self.command_tx
            .send(VadCommand::IsSpeechI16(
                audio_chunk.to_vec(),
                ReplyChannel::Async(reply_tx),
            ))
            .map_err(|_| Error::Config("VAD worker thread disconnected".to_string()))?;

        reply_rx
            .await
            .map_err(|_| Error::Config("VAD worker failed to respond".to_string()))?
    }

    /// Check if audio contains speech (async, f32)
    pub async fn is_speech_f32(&self, audio_chunk: &[f32]) -> Result<bool> {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        self.command_tx
            .send(VadCommand::IsSpeechF32(
                audio_chunk.to_vec(),
                ReplyChannel::Async(reply_tx),
            ))
            .map_err(|_| Error::Config("VAD worker thread disconnected".to_string()))?;

        reply_rx
            .await
            .map_err(|_| Error::Config("VAD worker failed to respond".to_string()))?
    }

    /// Check if audio contains speech (blocking, i16)
    ///
    /// This is a synchronous version for use in non-async contexts like
    /// dedicated audio processing threads.
    pub fn is_speech_blocking(&self, audio_chunk: &[i16]) -> Result<bool> {
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        self.command_tx
            .send(VadCommand::IsSpeechI16(
                audio_chunk.to_vec(),
                ReplyChannel::Sync(reply_tx),
            ))
            .map_err(|_| Error::Config("VAD worker thread disconnected".to_string()))?;

        reply_rx
            .recv()
            .map_err(|_| Error::Config("VAD worker failed to respond".to_string()))?
    }

    /// Check if audio contains speech (blocking, f32)
    ///
    /// This is a synchronous version for use in non-async contexts like
    /// dedicated audio processing threads.
    pub fn is_speech_f32_blocking(&self, audio_chunk: &[f32]) -> Result<bool> {
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        self.command_tx
            .send(VadCommand::IsSpeechF32(
                audio_chunk.to_vec(),
                ReplyChannel::Sync(reply_tx),
            ))
            .map_err(|_| Error::Config("VAD worker thread disconnected".to_string()))?;

        reply_rx
            .recv()
            .map_err(|_| Error::Config("VAD worker failed to respond".to_string()))?
    }

    /// Reset VAD state (async)
    pub async fn reset_state(&self) {
        let _ = self.command_tx.send(VadCommand::Reset);
    }

    /// Reset VAD state (blocking)
    pub fn reset_state_blocking(&self) {
        let _ = self.command_tx.send(VadCommand::Reset);
    }
}

#[cfg(feature = "vad")]
impl Drop for SharedVad {
    fn drop(&mut self) {
        let _ = self.command_tx.send(VadCommand::Shutdown);
        if let Some(handle) = self.worker_handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(feature = "vad")]
impl Clone for SharedVad {
    fn clone(&self) -> Self {
        Self {
            command_tx: self.command_tx.clone(),
            worker_handle: None, // Only the original owns the thread handle
        }
    }
}

/// VAD model manager (kept for API compatibility, but WebRTC VAD doesn't need models)
pub struct VadModelManager {
    models_dir: std::path::PathBuf,
}

impl VadModelManager {
    /// Create a new model manager
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            models_dir: app_data_dir.join("models").join("vad"),
        }
    }

    /// Get the path to the VAD model directory (WebRTC VAD doesn't need models)
    pub async fn ensure_model(&self) -> Result<std::path::PathBuf> {
        Ok(self.models_dir.clone())
    }

    /// Check if the model is available (always true for WebRTC VAD)
    pub fn is_model_available(&self) -> bool {
        true
    }

    /// Get the model directory path
    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }
}

/// Audio resampler for converting audio to the target sample rate
pub struct AudioResampler {
    source_rate: u32,
    target_rate: u32,
}

impl AudioResampler {
    /// Create a new resampler
    pub fn new(source_rate: u32) -> Self {
        Self {
            source_rate,
            target_rate: VAD_SAMPLE_RATE,
        }
    }

    /// Create a resampler with custom target rate
    pub fn new_with_target(source_rate: u32, target_rate: u32) -> Self {
        Self {
            source_rate,
            target_rate,
        }
    }

    /// Resample audio to target rate
    pub fn resample(&self, samples: &[f32]) -> Vec<f32> {
        if self.source_rate == self.target_rate {
            return samples.to_vec();
        }

        let ratio = self.source_rate as f64 / self.target_rate as f64;
        let output_len = (samples.len() as f64 / ratio).ceil() as usize;
        let mut output = Vec::with_capacity(output_len);

        for i in 0..output_len {
            let src_idx = i as f64 * ratio;
            let idx_floor = src_idx.floor() as usize;
            let idx_ceil = (idx_floor + 1).min(samples.len() - 1);
            let frac = src_idx - idx_floor as f64;

            let sample = samples[idx_floor] * (1.0 - frac as f32) + samples[idx_ceil] * frac as f32;
            output.push(sample);
        }

        output
    }

    /// Get the number of source samples needed to produce a given number of target samples
    pub fn source_samples_for_target(&self, target_samples: usize) -> usize {
        let ratio = self.source_rate as f64 / self.target_rate as f64;
        (target_samples as f64 * ratio).ceil() as usize
    }

    /// Get the target sample rate
    pub fn target_rate(&self) -> u32 {
        self.target_rate
    }
}

/// Stub WebRtcVad for when VAD feature is disabled
#[cfg(not(feature = "vad"))]
pub struct WebRtcVad;

#[cfg(not(feature = "vad"))]
impl WebRtcVad {
    pub fn new(_sample_rate: u32, _mode: VadMode) -> Result<Self> {
        Err(Error::Config(
            "VAD feature is not enabled. Rebuild with --features vad".to_string(),
        ))
    }

    pub fn is_speech(&mut self, _audio_chunk: &[i16]) -> Result<bool> {
        Err(Error::Config("VAD feature is not enabled".to_string()))
    }

    pub fn is_speech_f32(&mut self, _audio_chunk: &[f32]) -> Result<bool> {
        Err(Error::Config("VAD feature is not enabled".to_string()))
    }

    pub fn reset_state(&mut self) {}
}

/// Stub SharedVad for when VAD feature is disabled
#[cfg(not(feature = "vad"))]
pub struct SharedVad;

#[cfg(not(feature = "vad"))]
impl SharedVad {
    pub fn new(_sample_rate: u32, _mode: VadMode) -> Result<Self> {
        Err(Error::Config(
            "VAD feature is not enabled. Rebuild with --features vad".to_string(),
        ))
    }

    pub fn with_defaults() -> Result<Self> {
        Self::new(VAD_SAMPLE_RATE, VadMode::LowBitrate)
    }

    pub async fn is_speech(&self, _audio_chunk: &[i16]) -> Result<bool> {
        Err(Error::Config("VAD feature is not enabled".to_string()))
    }

    pub async fn is_speech_f32(&self, _audio_chunk: &[f32]) -> Result<bool> {
        Err(Error::Config("VAD feature is not enabled".to_string()))
    }

    pub async fn reset_state(&self) {}
}

#[cfg(not(feature = "vad"))]
impl Clone for SharedVad {
    fn clone(&self) -> Self {
        SharedVad
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_resampler_same_rate() {
        let resampler = AudioResampler::new(16000);
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let output = resampler.resample(&samples);
        assert_eq!(output, samples);
    }

    #[test]
    fn test_audio_resampler_downsample() {
        let resampler = AudioResampler::new(48000);
        let samples: Vec<f32> = (0..4800).map(|i| i as f32 / 4800.0).collect();
        let output = resampler.resample(&samples);
        assert!(output.len() < samples.len());
        assert!((output.len() as f32 / samples.len() as f32 - 1.0 / 3.0).abs() < 0.01);
    }

    #[test]
    fn test_audio_resampler_source_samples() {
        let resampler = AudioResampler::new(48000);
        let needed = resampler.source_samples_for_target(480);
        assert_eq!(needed, 1440);
    }

    #[test]
    fn test_vad_model_manager_path() {
        let manager = VadModelManager::new(Path::new("/tmp/test"));
        assert_eq!(manager.models_dir(), Path::new("/tmp/test/models/vad"));
    }

    #[test]
    fn test_vad_model_manager_always_available() {
        let manager = VadModelManager::new(Path::new("/tmp/test"));
        assert!(manager.is_model_available());
    }
}
