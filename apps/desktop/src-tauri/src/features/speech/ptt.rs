//! Push-to-talk functionality

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Push-to-talk configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PttConfig {
    pub enabled: bool,
    pub hotkey: String,
    pub release_delay_ms: u32,
    pub play_start_sound: bool,
    pub play_end_sound: bool,
}

impl Default for PttConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            hotkey: "Control+Space".to_string(),
            release_delay_ms: 200,
            play_start_sound: true,
            play_end_sound: true,
        }
    }
}

/// PTT state change event
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PttState {
    Idle,
    Recording,
    Processing,
}

/// Push-to-talk event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PttEvent {
    pub state: PttState,
    pub timestamp: i64,
    pub audio_duration_ms: Option<u64>,
}

/// Push-to-talk manager
pub struct PushToTalk {
    config: PttConfig,
    state: Arc<AtomicU8State>,
    is_key_down: Arc<AtomicBool>,
    event_tx: Option<mpsc::Sender<PttEvent>>,
    audio_buffer: Arc<std::sync::Mutex<Vec<u8>>>,
    recording_start: Arc<std::sync::Mutex<Option<std::time::Instant>>>,
}

/// Atomic state wrapper
struct AtomicU8State(std::sync::atomic::AtomicU8);

impl AtomicU8State {
    fn new(state: PttState) -> Self {
        Self(std::sync::atomic::AtomicU8::new(state as u8))
    }

    fn load(&self) -> PttState {
        match self.0.load(Ordering::SeqCst) {
            0 => PttState::Idle,
            1 => PttState::Recording,
            2 => PttState::Processing,
            _ => PttState::Idle,
        }
    }

    fn store(&self, state: PttState) {
        self.0.store(state as u8, Ordering::SeqCst);
    }
}

impl PushToTalk {
    pub fn new(config: PttConfig) -> Self {
        Self {
            config,
            state: Arc::new(AtomicU8State::new(PttState::Idle)),
            is_key_down: Arc::new(AtomicBool::new(false)),
            event_tx: None,
            audio_buffer: Arc::new(std::sync::Mutex::new(Vec::new())),
            recording_start: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Set event sender
    pub fn set_event_sender(&mut self, tx: mpsc::Sender<PttEvent>) {
        self.event_tx = Some(tx);
    }

    /// Handle key down (start recording)
    pub async fn key_down(&self) -> Result<()> {
        if !self.config.enabled {
            return Ok(());
        }

        if self.is_key_down.swap(true, Ordering::SeqCst) {
            // Already recording
            return Ok(());
        }

        // Clear audio buffer
        {
            let mut buffer = self
                .audio_buffer
                .lock()
                .map_err(|e| Error::Generic(e.to_string()))?;
            buffer.clear();
        }

        // Mark recording start
        {
            let mut start = self
                .recording_start
                .lock()
                .map_err(|e| Error::Generic(e.to_string()))?;
            *start = Some(std::time::Instant::now());
        }

        self.state.store(PttState::Recording);

        // Emit event
        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(PttEvent {
                    state: PttState::Recording,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    audio_duration_ms: None,
                })
                .await;
        }

        Ok(())
    }

    /// Handle key up (stop recording)
    pub async fn key_up(&self) -> Result<Option<Vec<u8>>> {
        if !self.is_key_down.swap(false, Ordering::SeqCst) {
            // Wasn't recording
            return Ok(None);
        }

        // Calculate duration
        let duration_ms = {
            let start = self
                .recording_start
                .lock()
                .map_err(|e| Error::Generic(e.to_string()))?;
            start.map(|s| s.elapsed().as_millis() as u64)
        };

        // Wait for release delay
        if self.config.release_delay_ms > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(
                self.config.release_delay_ms as u64,
            ))
            .await;
        }

        self.state.store(PttState::Processing);

        // Get audio buffer
        let audio = {
            let buffer = self
                .audio_buffer
                .lock()
                .map_err(|e| Error::Generic(e.to_string()))?;
            buffer.clone()
        };

        // Emit processing event
        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(PttEvent {
                    state: PttState::Processing,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    audio_duration_ms: duration_ms,
                })
                .await;
        }

        Ok(Some(audio))
    }

    /// Mark processing complete
    pub async fn processing_complete(&self) {
        self.state.store(PttState::Idle);

        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(PttEvent {
                    state: PttState::Idle,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    audio_duration_ms: None,
                })
                .await;
        }
    }

    /// Add audio data to buffer (called during recording)
    pub fn add_audio(&self, data: &[u8]) -> Result<()> {
        if self.state.load() != PttState::Recording {
            return Ok(());
        }

        let mut buffer = self
            .audio_buffer
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        buffer.extend_from_slice(data);

        Ok(())
    }

    /// Get current state
    pub fn get_state(&self) -> PttState {
        self.state.load()
    }

    /// Get configuration
    pub fn get_config(&self) -> &PttConfig {
        &self.config
    }

    /// Update configuration
    pub fn update_config(&mut self, config: PttConfig) {
        self.config = config;
    }

    /// Parse hotkey string
    pub fn parse_hotkey(&self) -> Vec<String> {
        self.config
            .hotkey
            .split('+')
            .map(|s| s.trim().to_string())
            .collect()
    }
}

impl Default for PushToTalk {
    fn default() -> Self {
        Self::new(PttConfig::default())
    }
}
