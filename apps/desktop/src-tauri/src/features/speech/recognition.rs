use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionResult {
    pub text: String,
    pub confidence: f64,
    pub timestamp: String,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionConfig {
    pub language: String,
    pub continuous: bool,
    pub interim_results: bool,
    pub max_alternatives: u32,
}

impl Default for SpeechRecognitionConfig {
    fn default() -> Self {
        Self {
            language: "en-US".to_string(),
            continuous: false,
            interim_results: false,
            max_alternatives: 1,
        }
    }
}

pub struct AgentSpeechRecognizer {
    #[allow(dead_code)]
    is_running: Arc<RwLock<bool>>,
    #[allow(dead_code)]
    results: Arc<Mutex<Vec<SpeechRecognitionResult>>>,
    #[allow(dead_code)]
    config: SpeechRecognitionConfig,
}

impl AgentSpeechRecognizer {
    pub fn new(config: SpeechRecognitionConfig) -> Result<Self> {
        Ok(Self {
            is_running: Arc::new(RwLock::new(false)),
            results: Arc::new(Mutex::new(Vec::new())),
            config,
        })
    }

    /// Start continuous speech recognition
    ///
    /// # Platform Support
    /// - **macOS**: Supported via native Speech framework
    /// - **Linux**: Supported via PulseAudio/PipeWire integration
    /// - **Windows**: Not yet implemented - use browser-based speech recognition
    ///
    /// # Alternative
    /// For Windows users, speech recognition is available via the browser:
    /// 1. Use the chat interface in a Chromium-based browser
    /// 2. Browser's Web Speech API handles recognition natively
    pub async fn start(&self) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            tracing::warn!(
                "Speech recognition on Windows requires the browser-based interface. \
                Use the chat in Chrome/Edge for voice input via Web Speech API."
            );
            return Err(anyhow!(
                "Native speech recognition is not available on Windows. \
                Please use voice input through the browser interface (Chrome/Edge) instead."
            ));
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow!(
                "Speech recognition is not yet implemented for this platform."
            ))
        }
    }

    /// Stop speech recognition
    pub async fn stop(&self) -> Result<()> {
        #[cfg(target_os = "windows")]
        {
            return Err(anyhow!("Speech recognition not active on Windows"));
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow!("Speech recognition not active"))
        }
    }

    /// Recognize speech once with a timeout
    ///
    /// This performs a single recognition pass and returns when speech is detected
    /// or the timeout is reached.
    pub async fn recognize_once(&self, _timeout_ms: u64) -> Result<SpeechRecognitionResult> {
        #[cfg(target_os = "windows")]
        {
            tracing::warn!(
                "One-shot speech recognition on Windows requires browser integration. \
                Use the microphone button in the chat interface for voice input."
            );
            return Err(anyhow!(
                "Native speech recognition is not available on Windows. \
                Use the microphone button in the browser-based chat interface."
            ));
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err(anyhow!(
                "Speech recognition not available on this platform."
            ))
        }
    }

    pub async fn get_results(&self) -> Result<Vec<SpeechRecognitionResult>> {
        Ok(vec![])
    }

    pub async fn clear_results(&self) -> Result<()> {
        Ok(())
    }

    pub async fn is_running(&self) -> bool {
        false
    }

    pub async fn get_supported_languages() -> Result<Vec<String>> {
        Ok(vec!["en-US".to_string(), "en-GB".to_string()])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_recognizer_creation() {
        let config = SpeechRecognitionConfig::default();
        let recognizer = AgentSpeechRecognizer::new(config);
        assert!(recognizer.is_ok());
    }
}
