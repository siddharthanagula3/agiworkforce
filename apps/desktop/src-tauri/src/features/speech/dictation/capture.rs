//! Native microphone capture for AGI Dictation.
//!
//! Plan stage 3 (`docs/specs/desktop-global-voice/spec.md`): device
//! enumeration/selection, sample-format dispatch, bounded buffering, and
//! device-change recovery, extracted from `sys/commands/voice.rs` so the
//! capture mechanics live in the dictation module and the Tauri commands stay
//! thin.
//!
//! Properties:
//! - The device's ACTUAL sample format decides the stream type (f32-only
//!   assumption previously broke i16/u16 devices).
//! - The sample buffer is bounded ([`MAX_CAPTURE_SECONDS`]); when the cap is
//!   reached the sink stops accepting samples and records truncation instead
//!   of growing without limit.
//! - Device loss mid-capture (cpal error callback) sets a flag that ends the
//!   capture thread promptly; samples captured up to that point are preserved
//!   so the transcript can still be produced (release-gate: device removal
//!   must preserve or recover the transcript safely).
//! - A preferred device that no longer exists falls back to the system
//!   default and REPORTS the substitution (`requested_device_honored`) rather
//!   than failing silently or refusing outright.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;

/// Hard cap for one capture session. 5 minutes of mono audio at 48 kHz is
/// ~57 MB of f32 samples, bounded, and far beyond a dictation utterance.
pub const MAX_CAPTURE_SECONDS: u32 = 300;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
}

/// Mono f32 sample sink with a hard capacity. Pure and unit-tested; the cpal
/// callback owns it behind a mutex.
pub struct BoundedSampleSink {
    samples: Vec<f32>,
    max_samples: usize,
    truncated: bool,
}

impl BoundedSampleSink {
    pub fn new(max_samples: usize) -> Self {
        Self {
            samples: Vec::new(),
            max_samples,
            truncated: false,
        }
    }

    /// Convert one interleaved callback buffer to mono f32 and append it,
    /// respecting the capacity. Returns `false` once the sink is full.
    pub fn push_interleaved<T>(&mut self, data: &[T], channels: usize) -> bool
    where
        T: cpal::SizedSample,
        f32: cpal::FromSample<T>,
    {
        use cpal::Sample;

        if self.truncated {
            return false;
        }
        let channels = channels.max(1);
        for frame in data.chunks(channels) {
            if self.samples.len() >= self.max_samples {
                self.truncated = true;
                return false;
            }
            let mono = frame
                .iter()
                .map(|sample| f32::from_sample(*sample))
                .sum::<f32>()
                / channels as f32;
            self.samples.push(mono);
        }
        true
    }

    pub fn truncated(&self) -> bool {
        self.truncated
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// Take the captured samples, leaving the sink empty.
    pub fn take_samples(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.samples)
    }
}

/// Holds state for an active capture session.
///
/// Uses `std::sync::Mutex` for the sink because `cpal::Stream` is not `Send`
///, the stream lives on a dedicated OS thread; this handle only carries the
/// shared flags/buffer and the thread's join handle.
pub struct CaptureHandle {
    /// When set to `true`, the capture thread stops and drops the stream.
    pub stop_flag: Arc<AtomicBool>,
    /// Set by the cpal error callback when the device disappears mid-capture;
    /// the capture thread exits promptly and captured samples are preserved.
    pub device_lost: Arc<AtomicBool>,
    /// Bounded mono f32 samples at the device's native sample rate.
    pub sink: Arc<Mutex<BoundedSampleSink>>,
    /// The sample rate reported by the input device (needed for WAV encoding).
    pub sample_rate: u32,
    /// The device the capture actually opened.
    pub device_name: String,
    /// False when a preferred device was requested but no longer exists and
    /// the system default was used instead (surfaced, never silent).
    pub requested_device_honored: bool,
    /// Join handle for the dedicated OS thread that owns the cpal::Stream.
    pub thread_handle: Option<std::thread::JoinHandle<()>>,
}

/// Enumerate input devices. Unlike `features/speech/wake.rs`'s
/// vad-feature-gated variant, dictation device selection must work in every
/// build profile.
pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate audio input devices: {e}"))?;

    let mut result = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
        let (sample_rate, channels) = device
            .default_input_config()
            .map(|c| (Some(c.sample_rate().0), Some(c.channels())))
            .unwrap_or((None, None));
        result.push(InputDeviceInfo {
            is_default: default_name.as_deref() == Some(name.as_str()),
            name,
            sample_rate,
            channels,
        });
    }
    Ok(result)
}

/// Resolve the capture device: the preferred device by name when it still
/// exists, otherwise the system default with `honored = false` so callers can
/// surface the substitution (device-change recovery, never silent).
fn resolve_input_device(
    host: &cpal::Host,
    preferred: Option<&str>,
) -> Result<(cpal::Device, String, bool), String> {
    if let Some(wanted) = preferred {
        if let Ok(devices) = host.input_devices() {
            for device in devices {
                if device.name().map(|n| n == wanted).unwrap_or(false) {
                    return Ok((device, wanted.to_string(), true));
                }
            }
        }
        tracing::warn!(
            "[dictation] preferred input device '{}' not found; falling back to system default",
            wanted
        );
    }

    let device = host
        .default_input_device()
        .ok_or_else(|| "No default audio input device found".to_string())?;
    let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
    let honored = preferred.is_none();
    Ok((device, name, honored))
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    stop_flag: Arc<AtomicBool>,
    device_lost: Arc<AtomicBool>,
    sink: Arc<Mutex<BoundedSampleSink>>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            if stop_flag.load(Ordering::Relaxed) {
                return;
            }
            if let Ok(mut sink) = sink.lock() {
                if !sink.push_interleaved(data, channels) && sink.truncated() {
                    // Bounded: the cap was hit; keep the stream open (cheap)
                    // but stop accumulating. Logged once by the sink state.
                    tracing::warn!(
                        "[dictation] capture buffer cap reached ({}s); further audio is dropped",
                        MAX_CAPTURE_SECONDS
                    );
                }
            }
        },
        move |err| {
            // Device unplugged / stream failed: flag it so the capture thread
            // exits promptly and captured samples survive.
            tracing::error!("[dictation] Audio stream error (device lost?): {}", err);
            device_lost.store(true, Ordering::SeqCst);
        },
        None,
    )
}

/// Open the device and start capturing on a dedicated OS thread.
pub fn start_capture(preferred_device: Option<&str>) -> Result<CaptureHandle, String> {
    let host = cpal::default_host();
    let (device, device_name, requested_device_honored) =
        resolve_input_device(&host, preferred_device)?;
    tracing::info!(
        "[dictation] Using audio input device: {} (requested honored: {})",
        device_name,
        requested_device_honored
    );

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get input device config: {e}"))?;

    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let sample_format = supported_config.sample_format();
    tracing::info!(
        "[dictation] Audio config: {} Hz, {} channel(s), {:?} samples",
        sample_rate,
        channels,
        sample_format
    );

    let stop_flag = Arc::new(AtomicBool::new(false));
    let device_lost = Arc::new(AtomicBool::new(false));
    let max_samples = (sample_rate as usize).saturating_mul(MAX_CAPTURE_SECONDS as usize);
    let sink = Arc::new(Mutex::new(BoundedSampleSink::new(max_samples)));

    let stop_flag_stream = stop_flag.clone();
    let stop_flag_poll = stop_flag.clone();
    let device_lost_stream = device_lost.clone();
    let device_lost_poll = device_lost.clone();
    let sink_cb = sink.clone();
    let ch = channels as usize;

    // Dedicated OS thread: cpal::Stream is not Send.
    let config_for_stream: cpal::StreamConfig = supported_config.into();
    let thread_handle = std::thread::Builder::new()
        .name("agi-dictation-capture".into())
        .spawn(move || {
            // Dispatch on the device's actual sample format instead of
            // assuming f32.
            let stream_result = match sample_format {
                cpal::SampleFormat::F32 => build_input_stream::<f32>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                cpal::SampleFormat::I16 => build_input_stream::<i16>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                cpal::SampleFormat::U16 => build_input_stream::<u16>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                cpal::SampleFormat::I32 => build_input_stream::<i32>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                cpal::SampleFormat::U8 => build_input_stream::<u8>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                cpal::SampleFormat::F64 => build_input_stream::<f64>(
                    &device,
                    &config_for_stream,
                    ch,
                    stop_flag_stream,
                    device_lost_stream,
                    sink_cb,
                ),
                other => {
                    tracing::error!("[dictation] Unsupported input sample format: {:?}", other);
                    return;
                }
            };

            match stream_result {
                Ok(stream) => {
                    if let Err(e) = stream.play() {
                        tracing::error!("[dictation] Failed to start audio stream: {}", e);
                        return;
                    }
                    tracing::info!("[dictation] Audio recording stream started");
                    // Keep the thread (and hence the stream) alive until a
                    // stop is requested or the device disappears.
                    while !stop_flag_poll.load(Ordering::Relaxed)
                        && !device_lost_poll.load(Ordering::Relaxed)
                    {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                    if device_lost_poll.load(Ordering::Relaxed) {
                        tracing::warn!(
                            "[dictation] capture ended early: input device lost; captured samples preserved"
                        );
                    }
                    // Stream drops here, stopping capture.
                    tracing::info!("[dictation] Audio recording stream stopped");
                }
                Err(e) => {
                    tracing::error!("[dictation] Failed to build input stream: {}", e);
                }
            }
        })
        .map_err(|e| format!("Failed to spawn dictation capture thread: {e}"))?;

    Ok(CaptureHandle {
        stop_flag,
        device_lost,
        sink,
        sample_rate,
        device_name,
        requested_device_honored,
        thread_handle: Some(thread_handle),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_interleaved_i16_stereo_to_mono_f32() {
        let mut sink = BoundedSampleSink::new(16);
        // Two stereo frames: (max, max) and (0, 0).
        assert!(sink.push_interleaved::<i16>(&[i16::MAX, i16::MAX, 0, 0], 2));
        let samples = sink.take_samples();
        assert_eq!(samples.len(), 2);
        assert!((samples[0] - 1.0).abs() < 1e-3, "full-scale i16 ~ 1.0");
        assert!(samples[1].abs() < 1e-6);
    }

    #[test]
    fn caps_the_buffer_and_reports_truncation() {
        let mut sink = BoundedSampleSink::new(3);
        assert!(sink.push_interleaved::<f32>(&[0.1, 0.2], 1));
        assert!(!sink.truncated());

        // Third sample fits; fourth exceeds the cap.
        assert!(!sink.push_interleaved::<f32>(&[0.3, 0.4], 1));
        assert!(sink.truncated());
        assert_eq!(sink.len(), 3);

        // Once truncated, further pushes are rejected outright.
        assert!(!sink.push_interleaved::<f32>(&[0.5], 1));
        assert_eq!(sink.len(), 3);
    }

    #[test]
    fn mono_input_passes_through_unchanged() {
        let mut sink = BoundedSampleSink::new(8);
        assert!(sink.push_interleaved::<f32>(&[0.25, -0.5], 1));
        assert_eq!(sink.take_samples(), vec![0.25, -0.5]);
    }

    #[test]
    fn zero_channel_input_is_treated_as_mono_not_a_panic() {
        let mut sink = BoundedSampleSink::new(8);
        assert!(sink.push_interleaved::<f32>(&[0.5], 0));
        assert_eq!(sink.len(), 1);
    }
}
