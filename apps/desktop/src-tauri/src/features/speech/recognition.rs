//! Speech Recognition Module
//!
//! This module provides speech-to-text functionality with multiple backend support:
//! - Deepgram (Nova-2/Nova-3) - Cloud-based streaming STT
//! - OpenAI Whisper - Cloud-based batch STT
//! - Browser Web Speech API - Client-side fallback
//!
//! # Provider Selection
//!
//! The module automatically selects the best provider based on configuration:
//! 1. If Deepgram API key is configured, use Deepgram for real-time streaming
//! 2. If OpenAI API key is configured, use Whisper for batch transcription
//! 3. Fall back to browser-based Web Speech API
//!
//! # Example
//!
//! ```ignore
//! use agiworkforce_desktop::features::speech::recognition::{
//!     SpeechRecognizer, SpeechRecognitionConfig, SpeechProvider
//! };
//!
//! let config = SpeechRecognitionConfig {
//!     provider: SpeechProvider::Deepgram,
//!     deepgram_api_key: Some("your-key".to_string()),
//!     ..Default::default()
//! };
//!
//! let recognizer = SpeechRecognizer::new(config)?;
//! let result = recognizer.recognize_once(5000).await?;
//! println!("Transcript: {}", result.text);
//! ```

use super::deepgram::{DeepgramClient, DeepgramConfig, TranscriptEvent};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

// AUDIT-004-006 fix: Cap results at 1000 to prevent unbounded memory growth
const MAX_RESULTS: usize = 1000;

/// Speech recognition result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionResult {
    /// The transcribed text
    pub text: String,
    /// Confidence score (0.0 to 1.0)
    pub confidence: f64,
    /// ISO 8601 timestamp when the result was generated
    pub timestamp: String,
    /// Whether this is a final result (vs interim/partial)
    pub is_final: bool,
    /// Word-level details (if available)
    pub words: Option<Vec<WordResult>>,
    /// Duration of the audio in seconds
    pub duration: Option<f64>,
    /// Provider that generated this result
    pub provider: String,
}

/// Word-level recognition result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordResult {
    /// The word text
    pub word: String,
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
    /// Confidence score (0.0 to 1.0)
    pub confidence: f64,
}

/// Speech recognition provider
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SpeechProvider {
    /// Deepgram Nova-2/Nova-3 (real-time streaming)
    #[default]
    Deepgram,
    /// OpenAI Whisper (batch processing)
    Whisper,
    /// Browser Web Speech API (client-side fallback)
    WebSpeech,
    /// Local Whisper model (if available)
    LocalWhisper,
}

/// Speech recognition configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechRecognitionConfig {
    /// The speech provider to use
    pub provider: SpeechProvider,
    /// Language code (e.g., "en-US", "en")
    pub language: String,
    /// Enable continuous recognition (vs single utterance)
    pub continuous: bool,
    /// Enable interim (partial) results
    pub interim_results: bool,
    /// Maximum number of alternative transcriptions
    pub max_alternatives: u32,
    /// Deepgram API key (required for Deepgram provider)
    pub deepgram_api_key: Option<String>,
    /// Deepgram model (e.g., "nova-2", "nova-3")
    pub deepgram_model: String,
    /// Whisper model (e.g., "whisper-1")
    pub whisper_model: String,
    /// Audio sample rate in Hz
    pub sample_rate: u32,
    /// Enable smart formatting
    pub smart_format: bool,
    /// Enable punctuation
    pub punctuate: bool,
}

impl Default for SpeechRecognitionConfig {
    fn default() -> Self {
        Self {
            provider: SpeechProvider::Deepgram,
            language: "en-US".to_string(),
            continuous: false,
            interim_results: true,
            max_alternatives: 1,
            deepgram_api_key: None,
            deepgram_model: "nova-2".to_string(),
            whisper_model: "whisper-1".to_string(),
            sample_rate: 16000,
            smart_format: true,
            punctuate: true,
        }
    }
}

/// Internal state for recognition session
struct RecognitionSession {
    /// Deepgram audio sender (if using Deepgram)
    deepgram_audio_tx: Option<mpsc::Sender<Vec<u8>>>,
    /// Deepgram transcript receiver
    // Used by: bidirectional streaming — will read real-time transcripts
    #[allow(dead_code)]
    deepgram_transcript_rx: Option<mpsc::Receiver<TranscriptEvent>>,
    /// Whether session is active
    // Used by: session lifecycle management — start/stop/pause
    #[allow(dead_code)]
    is_active: bool,
}

/// Speech recognizer with multi-provider support
pub struct SpeechRecognizer {
    config: SpeechRecognitionConfig,
    is_running: Arc<RwLock<bool>>,
    results: Arc<Mutex<Vec<SpeechRecognitionResult>>>,
    session: Arc<Mutex<Option<RecognitionSession>>>,
    deepgram_client: Option<Arc<DeepgramClient>>,
}

impl SpeechRecognizer {
    /// Create a new speech recognizer with the given configuration
    pub fn new(config: SpeechRecognitionConfig) -> Result<Self> {
        // Initialize Deepgram client if API key is provided
        let deepgram_client = if let Some(ref api_key) = config.deepgram_api_key {
            if !api_key.is_empty() {
                let deepgram_config = DeepgramConfig {
                    api_key: api_key.clone(),
                    model: config.deepgram_model.clone(),
                    language: config.language.clone(),
                    punctuate: config.punctuate,
                    interim_results: config.interim_results,
                    smart_format: config.smart_format,
                    sample_rate: config.sample_rate,
                    ..Default::default()
                };
                Some(Arc::new(DeepgramClient::new(deepgram_config)))
            } else {
                None
            }
        } else {
            None
        };

        Ok(Self {
            config,
            is_running: Arc::new(RwLock::new(false)),
            results: Arc::new(Mutex::new(Vec::new())),
            session: Arc::new(Mutex::new(None)),
            deepgram_client,
        })
    }

    /// Start continuous speech recognition
    ///
    /// Returns a receiver for recognition results.
    pub async fn start(&self) -> Result<mpsc::Receiver<SpeechRecognitionResult>> {
        // Check if already running
        if *self.is_running.read().await {
            return Err(anyhow!("Recognition session already active"));
        }

        let (result_tx, result_rx) = mpsc::channel::<SpeechRecognitionResult>(100);

        match self.config.provider {
            SpeechProvider::Deepgram => {
                self.start_deepgram_session(result_tx).await?;
            }
            SpeechProvider::Whisper => {
                return Err(anyhow!(
                    "OpenAI Whisper is a batch API and does not support continuous recognition. \
                    Use recognize_once() for single transcriptions or switch to Deepgram for streaming."
                ));
            }
            SpeechProvider::WebSpeech => {
                return Err(anyhow!(
                    "Web Speech API recognition must be handled by the browser frontend. \
                    Use the microphone button in the chat interface."
                ));
            }
            SpeechProvider::LocalWhisper => {
                return Err(anyhow!(
                    "Local Whisper recognition is not yet implemented. \
                    Please use Deepgram or OpenAI Whisper instead."
                ));
            }
        }

        *self.is_running.write().await = true;
        Ok(result_rx)
    }

    /// Start a Deepgram streaming session
    async fn start_deepgram_session(
        &self,
        result_tx: mpsc::Sender<SpeechRecognitionResult>,
    ) -> Result<()> {
        let client = self.deepgram_client.as_ref().ok_or_else(|| {
            anyhow!(
                "Deepgram API key not configured. \
                Please configure your Deepgram API key in settings."
            )
        })?;

        let (audio_tx, mut transcript_rx) = client.start_streaming().await.map_err(|e| {
            anyhow!(
                "Failed to start Deepgram streaming: {}. \
                Please check your API key and internet connection.",
                e
            )
        })?;

        // Store session state
        {
            let mut session_guard = self.session.lock().await;
            *session_guard = Some(RecognitionSession {
                deepgram_audio_tx: Some(audio_tx),
                deepgram_transcript_rx: None, // We're processing in a spawned task
                is_active: true,
            });
        }

        // Spawn task to forward transcripts
        let results = self.results.clone();
        let is_running = self.is_running.clone();

        tokio::spawn(async move {
            while let Some(event) = transcript_rx.recv().await {
                let result = SpeechRecognitionResult {
                    text: event.text.clone(),
                    confidence: event.confidence as f64,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    is_final: event.is_final,
                    words: Some(
                        event
                            .words
                            .iter()
                            .map(|w| WordResult {
                                word: w.word.clone(),
                                start: w.start,
                                end: w.end,
                                confidence: w.confidence as f64,
                            })
                            .collect(),
                    ),
                    duration: Some(event.duration),
                    provider: "deepgram".to_string(),
                };

                // AUDIT-004-006 fix: Store result with ring buffer to cap at MAX_RESULTS
                {
                    let mut results_guard = results.lock().await;
                    if results_guard.len() >= MAX_RESULTS {
                        // Remove oldest result to maintain bounded size
                        results_guard.remove(0);
                    }
                    results_guard.push(result.clone());
                }

                // Forward to receiver
                if result_tx.send(result).await.is_err() {
                    tracing::debug!("Result receiver dropped, stopping recognition");
                    break;
                }
            }

            // Mark as not running
            *is_running.write().await = false;
        });

        Ok(())
    }

    /// Stop speech recognition
    pub async fn stop(&self) -> Result<()> {
        if !*self.is_running.read().await {
            return Err(anyhow!("No active recognition session"));
        }

        // Stop Deepgram client if active
        if let Some(client) = &self.deepgram_client {
            client.stop_streaming().await;
        }

        // Clear session
        {
            let mut session_guard = self.session.lock().await;
            *session_guard = None;
        }

        *self.is_running.write().await = false;

        Ok(())
    }

    /// Send audio data to the recognizer
    ///
    /// Audio should be PCM 16-bit mono at the configured sample rate.
    pub async fn send_audio(&self, audio: Vec<u8>) -> Result<()> {
        let session_guard = self.session.lock().await;
        let session = session_guard
            .as_ref()
            .ok_or_else(|| anyhow!("No active recognition session"))?;

        if let Some(ref tx) = session.deepgram_audio_tx {
            tx.send(audio).await.map_err(|_| {
                anyhow!("Failed to send audio: session closed. Please restart the session.")
            })?;
        } else {
            return Err(anyhow!(
                "Audio streaming not available for current provider"
            ));
        }

        Ok(())
    }

    /// Recognize speech once with a timeout
    ///
    /// This performs a single recognition pass and returns when speech is detected
    /// or the timeout is reached.
    pub async fn recognize_once(&self, timeout_ms: u64) -> Result<SpeechRecognitionResult> {
        match self.config.provider {
            SpeechProvider::Deepgram => {
                // For Deepgram, we start a session and wait for a final result
                let client = self.deepgram_client.as_ref().ok_or_else(|| {
                    anyhow!(
                        "Deepgram API key not configured. \
                        Please configure your Deepgram API key in settings."
                    )
                })?;

                let (_audio_tx, mut transcript_rx) =
                    client.start_streaming().await.map_err(|e| {
                        anyhow!(
                            "Failed to start Deepgram streaming: {}. \
                            Please check your API key and internet connection.",
                            e
                        )
                    })?;

                // Wait for a final result with timeout
                let timeout = tokio::time::Duration::from_millis(timeout_ms);

                match tokio::time::timeout(timeout, async {
                    while let Some(event) = transcript_rx.recv().await {
                        if event.is_final && event.speech_final {
                            return Some(event);
                        }
                    }
                    None
                })
                .await
                {
                    Ok(Some(event)) => {
                        client.stop_streaming().await;
                        Ok(SpeechRecognitionResult {
                            text: event.text,
                            confidence: event.confidence as f64,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            is_final: true,
                            words: Some(
                                event
                                    .words
                                    .iter()
                                    .map(|w| WordResult {
                                        word: w.word.clone(),
                                        start: w.start,
                                        end: w.end,
                                        confidence: w.confidence as f64,
                                    })
                                    .collect(),
                            ),
                            duration: Some(event.duration),
                            provider: "deepgram".to_string(),
                        })
                    }
                    Ok(None) => {
                        client.stop_streaming().await;
                        Err(anyhow!(
                            "No speech detected. Please speak clearly and try again."
                        ))
                    }
                    Err(_) => {
                        client.stop_streaming().await;
                        Err(anyhow!(
                            "Recognition timed out after {} seconds. \
                            Please try again and speak within the time limit.",
                            timeout_ms / 1000
                        ))
                    }
                }
            }
            SpeechProvider::Whisper => Err(anyhow!(
                "OpenAI Whisper requires an audio file. Use voice_transcribe_file instead."
            )),
            SpeechProvider::WebSpeech => {
                #[cfg(target_os = "windows")]
                {
                    tracing::warn!(
                        "Speech recognition on Windows requires the browser-based interface."
                    );
                    return Err(anyhow!(
                        "Native speech recognition is not available on Windows. \
                        Please use voice input through the browser interface (Chrome/Edge) instead."
                    ));
                }

                #[cfg(not(target_os = "windows"))]
                {
                    Err(anyhow!(
                        "Web Speech API recognition must be handled by the browser frontend. \
                        Use the microphone button in the chat interface."
                    ))
                }
            }
            SpeechProvider::LocalWhisper => Err(anyhow!(
                "Local Whisper recognition is not yet implemented. \
                Please use Deepgram or OpenAI Whisper instead."
            )),
        }
    }

    /// Get all recognition results from the current session
    pub async fn get_results(&self) -> Result<Vec<SpeechRecognitionResult>> {
        let results = self.results.lock().await;
        Ok(results.clone())
    }

    /// Clear all stored results
    pub async fn clear_results(&self) -> Result<()> {
        let mut results = self.results.lock().await;
        results.clear();
        Ok(())
    }

    /// Check if recognition is currently running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    /// Get list of supported languages
    pub async fn get_supported_languages() -> Result<Vec<String>> {
        // These are the most commonly used languages supported by Deepgram Nova-2
        Ok(vec![
            "en-US".to_string(),
            "en-GB".to_string(),
            "en-AU".to_string(),
            "en-IN".to_string(),
            "es".to_string(),
            "es-419".to_string(),
            "fr".to_string(),
            "fr-CA".to_string(),
            "de".to_string(),
            "it".to_string(),
            "pt".to_string(),
            "pt-BR".to_string(),
            "nl".to_string(),
            "ja".to_string(),
            "ko".to_string(),
            "zh-CN".to_string(),
            "zh-TW".to_string(),
            "hi".to_string(),
            "ru".to_string(),
            "pl".to_string(),
            "uk".to_string(),
            "tr".to_string(),
            "sv".to_string(),
            "da".to_string(),
            "no".to_string(),
            "fi".to_string(),
        ])
    }

    /// Get current configuration
    pub fn get_config(&self) -> &SpeechRecognitionConfig {
        &self.config
    }

    /// Update configuration (only effective before next session)
    pub fn update_config(&mut self, config: SpeechRecognitionConfig) {
        // Update Deepgram client if API key changed
        if config.deepgram_api_key != self.config.deepgram_api_key {
            self.deepgram_client = config.deepgram_api_key.as_ref().and_then(|api_key| {
                if !api_key.is_empty() {
                    let deepgram_config = DeepgramConfig {
                        api_key: api_key.clone(),
                        model: config.deepgram_model.clone(),
                        language: config.language.clone(),
                        punctuate: config.punctuate,
                        interim_results: config.interim_results,
                        smart_format: config.smart_format,
                        sample_rate: config.sample_rate,
                        ..Default::default()
                    };
                    Some(Arc::new(DeepgramClient::new(deepgram_config)))
                } else {
                    None
                }
            });
        }

        self.config = config;
    }
}

// Legacy type alias for backward compatibility
pub type AgentSpeechRecognizer = SpeechRecognizer;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SpeechRecognitionConfig::default();
        assert_eq!(config.language, "en-US");
        assert!(!config.continuous);
        assert!(config.interim_results);
        assert_eq!(config.max_alternatives, 1);
        assert_eq!(config.deepgram_model, "nova-2");
        assert_eq!(config.sample_rate, 16000);
    }

    #[tokio::test]
    async fn test_recognizer_creation() {
        let config = SpeechRecognitionConfig::default();
        let recognizer = SpeechRecognizer::new(config);
        assert!(recognizer.is_ok());
    }

    #[tokio::test]
    async fn test_recognizer_not_running_initially() {
        let config = SpeechRecognitionConfig::default();
        let recognizer = SpeechRecognizer::new(config).unwrap();
        assert!(!recognizer.is_running().await);
    }

    #[tokio::test]
    async fn test_stop_without_start() {
        let config = SpeechRecognitionConfig::default();
        let recognizer = SpeechRecognizer::new(config).unwrap();
        let result = recognizer.stop().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_empty_results() {
        let config = SpeechRecognitionConfig::default();
        let recognizer = SpeechRecognizer::new(config).unwrap();
        let results = recognizer.get_results().await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_supported_languages() {
        let languages = SpeechRecognizer::get_supported_languages().await.unwrap();
        assert!(!languages.is_empty());
        assert!(languages.contains(&"en-US".to_string()));
    }

    #[test]
    fn test_speech_provider_serialization() {
        let provider = SpeechProvider::Deepgram;
        let json = serde_json::to_string(&provider).unwrap();
        assert_eq!(json, "\"deepgram\"");

        let deserialized: SpeechProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, SpeechProvider::Deepgram);
    }
}
