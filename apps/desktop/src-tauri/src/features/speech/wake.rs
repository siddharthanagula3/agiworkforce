//! Voice Wake word detection

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Wake word detection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeWordConfig {
    pub enabled: bool,
    pub wake_phrases: Vec<String>,
    pub sensitivity: f32,
    pub audio_device: Option<String>,
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

/// Voice Wake detector using VAD (Voice Activity Detection)
pub struct VoiceWake {
    config: WakeWordConfig,
    is_listening: Arc<AtomicBool>,
    event_tx: Option<mpsc::Sender<WakeWordEvent>>,
}

impl VoiceWake {
    pub fn new(config: WakeWordConfig) -> Self {
        Self {
            config,
            is_listening: Arc::new(AtomicBool::new(false)),
            event_tx: None,
        }
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

        // Spawn detection task
        tokio::spawn(async move {
            Self::detection_loop(config, is_listening, tx).await;
        });

        Ok(rx)
    }

    /// Detection loop (simplified - in real impl would use audio input)
    async fn detection_loop(
        _config: WakeWordConfig,
        is_listening: Arc<AtomicBool>,
        _tx: mpsc::Sender<WakeWordEvent>,
    ) {
        while is_listening.load(Ordering::SeqCst) {
            // In real implementation, this would:
            // 1. Capture audio from microphone
            // 2. Run VAD to detect speech
            // 3. Transcribe short audio segments
            // 4. Match against wake phrases

            // For now, just sleep to avoid busy loop
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            // Placeholder detection logic would go here
            // When detected:
            // let _ = tx.send(WakeWordEvent {
            //     phrase_detected: phrase.clone(),
            //     confidence: 0.95,
            //     timestamp: chrono::Utc::now().timestamp_millis(),
            // }).await;
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
        for j in 0..=n {
            matrix[0][j] = j;
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
}
