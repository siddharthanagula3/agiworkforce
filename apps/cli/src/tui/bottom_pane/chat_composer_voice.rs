//! Voice hold-to-talk and transcription methods for [`ChatComposer`].
//!
//! All methods in this module are gated to non-Linux targets because voice
//! capture depends on platform audio APIs unavailable on Linux.
use crate::bottom_pane::chat_composer::ChatComposer;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use std::time::Instant;
use tokio::runtime::Handle;

#[cfg(not(target_os = "linux"))]
impl ChatComposer {
    /// Returns true if voice transcription is enabled for this composer.
    pub(crate) fn voice_transcription_enabled(&self) -> bool {
        self.voice_state.transcription_enabled
    }

    pub(crate) fn process_space_hold_trigger(&mut self) {
        if self.voice_transcription_enabled()
            && let Some(flag) = self.voice_state.space_hold_trigger.as_ref()
            && flag.load(Ordering::Relaxed)
            && self.voice_state.space_hold_started_at.is_some()
            && self.voice_state.voice.is_none()
        {
            let _ = self.on_space_hold_timeout();
        }

        const SPACE_REPEAT_INITIAL_GRACE_MILLIS: u64 = 700;
        const SPACE_REPEAT_IDLE_TIMEOUT_MILLIS: u64 = 250;
        if !self.voice_state.key_release_supported && self.voice_state.voice.is_some() {
            let now = Instant::now();
            let initial_grace = Duration::from_millis(SPACE_REPEAT_INITIAL_GRACE_MILLIS);
            let repeat_idle_timeout = Duration::from_millis(SPACE_REPEAT_IDLE_TIMEOUT_MILLIS);
            if let Some(started_at) = self.voice_state.space_recording_started_at
                && now.saturating_duration_since(started_at) >= initial_grace
            {
                let should_stop = match self.voice_state.space_recording_last_repeat_at {
                    Some(last_repeat_at) => {
                        now.saturating_duration_since(last_repeat_at) >= repeat_idle_timeout
                    }
                    None => true,
                };
                if should_stop {
                    let _ = self.stop_recording_and_start_transcription();
                }
            }
        }
    }

    /// Called when the 1s space hold timeout elapses.
    ///
    /// On terminals without key-release reporting, this only transitions into voice capture if we
    /// observed repeated Space events while pending; otherwise the keypress is treated as a typed
    /// space.
    pub(crate) fn on_space_hold_timeout(&mut self) -> bool {
        if !self.voice_transcription_enabled() {
            return false;
        }
        if self.voice_state.voice.is_some() {
            return false;
        }
        if self.voice_state.space_hold_started_at.is_some() {
            if !self.voice_state.key_release_supported && !self.voice_state.space_hold_repeat_seen {
                if let Some(id) = self.voice_state.space_hold_element_id.take() {
                    let _ = self.textarea.replace_element_by_id(&id, " ");
                }
                self.voice_state.space_hold_started_at = None;
                self.voice_state.space_hold_trigger = None;
                self.voice_state.space_hold_repeat_seen = false;
                return true;
            }

            // Preserve the typed space when transitioning into voice capture, but
            // avoid duplicating an existing trailing space. In either case,
            // convert/remove the temporary named element before inserting the
            // recording/transcribing placeholder.
            if let Some(id) = self.voice_state.space_hold_element_id.take() {
                let replacement = if self
                    .textarea
                    .named_element_range(&id)
                    .and_then(|range| self.textarea.text()[..range.start].chars().next_back())
                    .is_some_and(|ch| ch == ' ')
                {
                    ""
                } else {
                    " "
                };
                let _ = self.textarea.replace_element_by_id(&id, replacement);
            }
            // Clear pending state before starting capture
            self.voice_state.space_hold_started_at = None;
            self.voice_state.space_hold_trigger = None;
            self.voice_state.space_hold_repeat_seen = false;

            // Start voice capture
            self.start_recording_with_placeholder()
        } else {
            false
        }
    }

    /// Stop recording if active, update the placeholder, and spawn background transcription.
    /// Returns true if the UI should redraw.
    pub(crate) fn stop_recording_and_start_transcription(&mut self) -> bool {
        let Some(vc) = self.voice_state.voice.take() else {
            return false;
        };
        self.voice_state.space_recording_started_at = None;
        self.voice_state.space_recording_last_repeat_at = None;
        match vc.stop() {
            Ok(audio) => {
                // If the recording is too short, remove the placeholder immediately
                // and skip the transcribing state entirely.
                let total_samples = audio.data.len() as f32;
                let samples_per_second = (audio.sample_rate as f32) * (audio.channels as f32);
                let duration_seconds = if samples_per_second > 0.0 {
                    total_samples / samples_per_second
                } else {
                    0.0
                };
                const MIN_DURATION_SECONDS: f32 = 1.0;
                if duration_seconds < MIN_DURATION_SECONDS {
                    if let Some(id) = self.voice_state.recording_placeholder_id.take() {
                        let _ = self.textarea.replace_element_by_id(&id, "");
                    }
                    return true;
                }

                // Otherwise, update the placeholder to show a spinner and proceed.
                let id = match self.voice_state.recording_placeholder_id.take() {
                    Some(id) => id,
                    None => self.next_id(),
                };

                let placeholder_range = self.textarea.named_element_range(&id);
                let prompt_source = if let Some(range) = &placeholder_range {
                    self.textarea.text()[..range.start].to_string()
                } else {
                    self.textarea.text().to_string()
                };

                // Initialize with first spinner frame immediately.
                let _ = self.textarea.update_named_element_by_id(&id, "⠋");
                // Spawn animated braille spinner until transcription finishes (or times out).
                self.spawn_transcribing_spinner(id.clone());
                let tx = self.app_event_tx.clone();
                crate::voice::transcribe_async(id, audio, Some(prompt_source), tx);
                true
            }
            Err(e) => {
                tracing::error!("failed to stop voice capture: {e}");
                true
            }
        }
    }

    /// Start voice capture and insert a placeholder element for the live meter.
    /// Returns true if recording began and UI should redraw; false on failure.
    pub(crate) fn start_recording_with_placeholder(&mut self) -> bool {
        match crate::voice::VoiceCapture::start() {
            Ok(vc) => {
                self.voice_state.voice = Some(vc);
                if self.voice_state.key_release_supported {
                    self.voice_state.space_recording_started_at = None;
                } else {
                    self.voice_state.space_recording_started_at = Some(Instant::now());
                }
                self.voice_state.space_recording_last_repeat_at = None;
                // Insert visible placeholder for the meter (no label)
                let id = self.next_id();
                self.textarea.insert_named_element("", id.clone());
                self.voice_state.recording_placeholder_id = Some(id);
                // Spawn metering animation
                if let Some(v) = &self.voice_state.voice {
                    let data = v.data_arc();
                    let stop = v.stopped_flag();
                    let sr = v.sample_rate();
                    let ch = v.channels();
                    let peak = v.last_peak_arc();
                    if let Some(idref) = &self.voice_state.recording_placeholder_id {
                        self.spawn_recording_meter(idref.clone(), sr, ch, data, peak, stop);
                    }
                }
                true
            }
            Err(e) => {
                self.voice_state.space_recording_started_at = None;
                self.voice_state.space_recording_last_repeat_at = None;
                tracing::error!("failed to start voice capture: {e}");
                false
            }
        }
    }

    fn spawn_recording_meter(
        &self,
        id: String,
        _sample_rate: u32,
        _channels: u16,
        _data: Arc<Mutex<Vec<i16>>>,
        last_peak: Arc<std::sync::atomic::AtomicU16>,
        stop: Arc<std::sync::atomic::AtomicBool>,
    ) {
        let tx = self.app_event_tx.clone();
        let task = move || {
            use std::time::Duration;
            let mut meter = crate::voice::RecordingMeterState::new();
            loop {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let text = meter.next_text(last_peak.load(Ordering::Relaxed));
                tx.send(crate::app_event::AppEvent::UpdateRecordingMeter {
                    id: id.clone(),
                    text,
                });

                thread::sleep(Duration::from_millis(100));
            }
        };

        if let Ok(handle) = Handle::try_current() {
            handle.spawn_blocking(task);
        } else {
            thread::spawn(task);
        }
    }

    pub(crate) fn spawn_transcribing_spinner(&mut self, id: String) {
        self.stop_transcription_spinner(&id);
        let stop = Arc::new(AtomicBool::new(false));
        self.spinner_stop_flags
            .insert(id.clone(), Arc::clone(&stop));

        let tx = self.app_event_tx.clone();
        let task = move || {
            use std::time::Duration;
            let frames: Vec<&'static str> = vec!["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let mut i: usize = 0;
            // Safety stop after ~60s to avoid a runaway task if events are lost.
            let max_ticks = 600usize; // 600 * 100ms = 60s
            for _ in 0..max_ticks {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let text = frames[i % frames.len()].to_string();
                tx.send(crate::app_event::AppEvent::UpdateRecordingMeter {
                    id: id.clone(),
                    text,
                });
                i = i.wrapping_add(1);
                thread::sleep(Duration::from_millis(100));
            }
        };

        if let Ok(handle) = Handle::try_current() {
            handle.spawn_blocking(task);
        } else {
            thread::spawn(task);
        }
    }

    pub(crate) fn stop_transcription_spinner(&mut self, id: &str) {
        if let Some(flag) = self.spinner_stop_flags.remove(id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub(crate) fn stop_all_transcription_spinners(&mut self) {
        for (_id, flag) in self.spinner_stop_flags.drain() {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn replace_transcription(&mut self, id: &str, text: &str) {
        self.stop_transcription_spinner(id);
        let _ = self.textarea.replace_element_by_id(id, text);
    }

    pub fn update_transcription_in_place(&mut self, id: &str, text: &str) -> bool {
        self.textarea.update_named_element_by_id(id, text)
    }

    pub fn insert_transcription_placeholder(&mut self, text: &str) -> String {
        let id = self.next_id();
        self.textarea.insert_named_element(text, id.clone());
        id
    }

    pub fn remove_transcription_placeholder(&mut self, id: &str) {
        self.stop_transcription_spinner(id);
        let _ = self.textarea.replace_element_by_id(id, "");
    }
}
