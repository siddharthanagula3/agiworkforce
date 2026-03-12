//! Deepgram Nova-3 WebSocket Speech-to-Text Integration
//!
//! This module provides real-time streaming speech-to-text using Deepgram's
//! Nova-2/Nova-3 models via WebSocket connection.
//!
//! # Features
//!
//! - Real-time streaming transcription
//! - Interim (partial) and final results
//! - Word-level timestamps and confidence
//! - Automatic punctuation
//! - Automatic reconnection on disconnect
//!
//! # Example
//!
//! ```ignore
//! use agiworkforce_desktop::features::speech::deepgram::{DeepgramClient, DeepgramConfig};
//!
//! let config = DeepgramConfig {
//!     api_key: "your-api-key".to_string(),
//!     model: "nova-2".to_string(),
//!     ..Default::default()
//! };
//!
//! let client = DeepgramClient::new(config);
//! let (audio_tx, transcript_rx) = client.start_streaming().await?;
//!
//! // Send audio chunks
//! audio_tx.send(audio_chunk).await?;
//!
//! // Receive transcripts
//! while let Some(event) = transcript_rx.recv().await {
//!     println!("Transcript: {} (final: {})", event.text, event.is_final);
//! }
//! ```

use crate::sys::error::{Error, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Deepgram API WebSocket base URL
const DEEPGRAM_WS_URL: &str = "wss://api.deepgram.com/v1/listen";

/// Default sample rate for audio (16kHz is optimal for speech)
pub const DEFAULT_SAMPLE_RATE: u32 = 16000;

/// Default encoding for audio
pub const DEFAULT_ENCODING: &str = "linear16";

/// Deepgram client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepgramConfig {
    /// Deepgram API key
    pub api_key: String,
    /// Model to use (e.g., "nova-2", "nova-3")
    pub model: String,
    /// Language code (e.g., "en-US", "en")
    pub language: String,
    /// Enable punctuation
    pub punctuate: bool,
    /// Enable interim (partial) results
    pub interim_results: bool,
    /// Enable smart formatting
    pub smart_format: bool,
    /// Enable diarization (speaker identification)
    pub diarize: bool,
    /// Audio sample rate in Hz
    pub sample_rate: u32,
    /// Number of audio channels
    pub channels: u16,
    /// Audio encoding format
    pub encoding: String,
    /// Enable utterance detection (end of speech detection)
    pub utterances: bool,
    /// Utterance end silence threshold in milliseconds
    pub utt_split: Option<u32>,
    /// Enable profanity filter
    pub profanity_filter: bool,
    /// Enable redaction of sensitive information
    pub redact: Vec<String>,
    /// Custom vocabulary boost
    pub keywords: Vec<String>,
    /// Keyword boost value (0.0 to 5.0)
    pub keywords_boost: Option<f32>,
}

impl Default for DeepgramConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "nova-2".to_string(),
            language: "en-US".to_string(),
            punctuate: true,
            interim_results: true,
            smart_format: true,
            diarize: false,
            sample_rate: DEFAULT_SAMPLE_RATE,
            channels: 1,
            encoding: DEFAULT_ENCODING.to_string(),
            utterances: true,
            utt_split: Some(800), // 800ms of silence to split utterances
            profanity_filter: false,
            redact: vec![],
            keywords: vec![],
            keywords_boost: None,
        }
    }
}

/// A single word in the transcript with timing information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    /// The word text
    pub word: String,
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
    /// Confidence score (0.0 to 1.0)
    pub confidence: f32,
    /// Speaker ID (if diarization is enabled)
    pub speaker: Option<u32>,
    /// Whether the word was punctuated
    pub punctuated_word: Option<String>,
}

/// Transcript event received from Deepgram
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEvent {
    /// The transcribed text
    pub text: String,
    /// Whether this is a final result (vs interim/partial)
    pub is_final: bool,
    /// Confidence score for the transcript (0.0 to 1.0)
    pub confidence: f32,
    /// Individual words with timing
    pub words: Vec<Word>,
    /// Start time of this segment in seconds
    pub start: f64,
    /// Duration of this segment in seconds
    pub duration: f64,
    /// Channel index (for multi-channel audio)
    pub channel: u32,
    /// Speech is final (end of utterance detected)
    pub speech_final: bool,
}

/// Connection state for the Deepgram WebSocket
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionState {
    /// Not connected
    Disconnected,
    /// Attempting to connect
    Connecting,
    /// Connected and ready
    Connected,
    /// Reconnecting after disconnect
    Reconnecting,
    /// Connection closed intentionally
    Closed,
    /// Connection failed with error
    Error,
}

/// Deepgram streaming statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingStats {
    /// Total audio bytes sent
    pub bytes_sent: u64,
    /// Total audio duration sent in seconds
    pub duration_sent: f64,
    /// Number of transcript events received
    pub transcripts_received: u32,
    /// Number of reconnection attempts
    pub reconnect_attempts: u32,
    /// Current connection state
    pub state: ConnectionState,
}

/// Internal state for managing the WebSocket connection
struct StreamState {
    /// Current connection state
    state: ConnectionState,
    /// Statistics
    stats: StreamingStats,
    /// Whether the stream should be running
    should_run: bool,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            state: ConnectionState::Disconnected,
            stats: StreamingStats {
                bytes_sent: 0,
                duration_sent: 0.0,
                transcripts_received: 0,
                reconnect_attempts: 0,
                state: ConnectionState::Disconnected,
            },
            should_run: false,
        }
    }
}

/// Deepgram WebSocket client for streaming speech-to-text
pub struct DeepgramClient {
    config: DeepgramConfig,
    state: Arc<RwLock<StreamState>>,
    is_streaming: Arc<AtomicBool>,
    reconnect_attempts: Arc<AtomicU32>,
}

impl DeepgramClient {
    /// Create a new Deepgram client with the given configuration
    pub fn new(config: DeepgramConfig) -> Self {
        Self {
            config,
            state: Arc::new(RwLock::new(StreamState::default())),
            is_streaming: Arc::new(AtomicBool::new(false)),
            reconnect_attempts: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Create a client with default configuration and the given API key
    pub fn with_api_key(api_key: String) -> Self {
        Self::new(DeepgramConfig {
            api_key,
            ..Default::default()
        })
    }

    /// Build the WebSocket URL with query parameters
    fn build_ws_url(&self) -> String {
        let mut params = vec![
            format!("model={}", self.config.model),
            format!("language={}", self.config.language),
            format!("punctuate={}", self.config.punctuate),
            format!("interim_results={}", self.config.interim_results),
            format!("smart_format={}", self.config.smart_format),
            format!("diarize={}", self.config.diarize),
            format!("sample_rate={}", self.config.sample_rate),
            format!("channels={}", self.config.channels),
            format!("encoding={}", self.config.encoding),
            format!("utterances={}", self.config.utterances),
        ];

        if let Some(utt_split) = self.config.utt_split {
            params.push(format!("utt_split={}", utt_split));
        }

        if self.config.profanity_filter {
            params.push("profanity_filter=true".to_string());
        }

        for redact_type in &self.config.redact {
            params.push(format!("redact={}", redact_type));
        }

        for keyword in &self.config.keywords {
            params.push(format!("keywords={}", urlencoding::encode(keyword)));
        }

        if let Some(boost) = self.config.keywords_boost {
            params.push(format!("keywords_boost={}", boost));
        }

        format!("{}?{}", DEEPGRAM_WS_URL, params.join("&"))
    }

    /// Start a streaming transcription session
    ///
    /// Returns a tuple of:
    /// - Sender for audio data (send Vec<u8> PCM audio chunks)
    /// - Receiver for transcript events
    pub async fn start_streaming(
        &self,
    ) -> Result<(mpsc::Sender<Vec<u8>>, mpsc::Receiver<TranscriptEvent>)> {
        if self.config.api_key.is_empty() {
            return Err(Error::Config(
                "Deepgram API key is required. Please configure your API key.".to_string(),
            ));
        }

        if self.is_streaming.load(Ordering::SeqCst) {
            return Err(Error::Config(
                "Streaming session already active. Stop the current session first.".to_string(),
            ));
        }

        self.is_streaming.store(true, Ordering::SeqCst);

        let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(100);
        let (transcript_tx, transcript_rx) = mpsc::channel::<TranscriptEvent>(100);

        // Update state
        {
            let mut state = self.state.write().await;
            state.state = ConnectionState::Connecting;
            state.should_run = true;
            state.stats = StreamingStats {
                bytes_sent: 0,
                duration_sent: 0.0,
                transcripts_received: 0,
                reconnect_attempts: 0,
                state: ConnectionState::Connecting,
            };
        }

        // Spawn the streaming task
        let config = self.config.clone();
        let state = self.state.clone();
        let is_streaming = self.is_streaming.clone();
        let reconnect_attempts = self.reconnect_attempts.clone();
        let ws_url = self.build_ws_url();

        tokio::spawn(async move {
            Self::streaming_loop(
                config,
                state,
                is_streaming,
                reconnect_attempts,
                ws_url,
                audio_rx,
                transcript_tx,
            )
            .await;
        });

        Ok((audio_tx, transcript_rx))
    }

    /// Internal streaming loop with reconnection logic
    async fn streaming_loop(
        config: DeepgramConfig,
        state: Arc<RwLock<StreamState>>,
        is_streaming: Arc<AtomicBool>,
        reconnect_attempts: Arc<AtomicU32>,
        ws_url: String,
        mut audio_rx: mpsc::Receiver<Vec<u8>>,
        transcript_tx: mpsc::Sender<TranscriptEvent>,
    ) {
        const MAX_RECONNECT_ATTEMPTS: u32 = 5;
        const RECONNECT_DELAY_MS: u64 = 1000;

        while is_streaming.load(Ordering::SeqCst) {
            // Check if we should attempt to connect
            {
                let state_guard = state.read().await;
                if !state_guard.should_run {
                    break;
                }
            }

            // Attempt connection
            tracing::info!("Connecting to Deepgram at {}", ws_url);

            let connect_result = Self::connect_with_auth(&ws_url, &config.api_key).await;

            match connect_result {
                Ok(ws_stream) => {
                    // Reset reconnect counter on successful connection
                    reconnect_attempts.store(0, Ordering::SeqCst);

                    // Update state to connected
                    {
                        let mut state_guard = state.write().await;
                        state_guard.state = ConnectionState::Connected;
                        state_guard.stats.state = ConnectionState::Connected;
                    }

                    tracing::info!("Connected to Deepgram successfully");

                    // Handle the connection
                    let disconnect_reason = Self::handle_connection(
                        ws_stream,
                        &mut audio_rx,
                        &transcript_tx,
                        &state,
                        &is_streaming,
                        config.sample_rate,
                        config.channels,
                    )
                    .await;

                    tracing::info!("Deepgram connection closed: {:?}", disconnect_reason);

                    // Check if we should reconnect
                    if !is_streaming.load(Ordering::SeqCst) {
                        break;
                    }

                    // Check reconnect attempts
                    let attempts = reconnect_attempts.fetch_add(1, Ordering::SeqCst) + 1;
                    if attempts >= MAX_RECONNECT_ATTEMPTS {
                        tracing::error!(
                            "Max reconnection attempts ({}) reached, giving up",
                            MAX_RECONNECT_ATTEMPTS
                        );
                        break;
                    }

                    // Update state for reconnection
                    {
                        let mut state_guard = state.write().await;
                        state_guard.state = ConnectionState::Reconnecting;
                        state_guard.stats.state = ConnectionState::Reconnecting;
                        state_guard.stats.reconnect_attempts = attempts;
                    }

                    // Wait before reconnecting
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        RECONNECT_DELAY_MS * attempts as u64,
                    ))
                    .await;
                }
                Err(e) => {
                    tracing::error!("Failed to connect to Deepgram: {}", e);

                    let attempts = reconnect_attempts.fetch_add(1, Ordering::SeqCst) + 1;
                    if attempts >= MAX_RECONNECT_ATTEMPTS {
                        // Update state to error
                        let mut state_guard = state.write().await;
                        state_guard.state = ConnectionState::Error;
                        state_guard.stats.state = ConnectionState::Error;
                        break;
                    }

                    // Wait before retrying
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        RECONNECT_DELAY_MS * attempts as u64,
                    ))
                    .await;
                }
            }
        }

        // Final state update
        {
            let mut state_guard = state.write().await;
            if state_guard.state != ConnectionState::Error {
                state_guard.state = ConnectionState::Closed;
                state_guard.stats.state = ConnectionState::Closed;
            }
        }

        is_streaming.store(false, Ordering::SeqCst);
        tracing::info!("Deepgram streaming loop ended");
    }

    /// Connect to WebSocket with authentication header
    async fn connect_with_auth(
        url: &str,
        api_key: &str,
    ) -> std::result::Result<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        String,
    > {
        use tokio_tungstenite::tungstenite::http::Request;

        let request = Request::builder()
            .uri(url)
            .header("Authorization", format!("Token {}", api_key))
            .header("Host", "api.deepgram.com")
            .header("Upgrade", "websocket")
            .header("Connection", "Upgrade")
            .header("Sec-WebSocket-Key", generate_websocket_key())
            .header("Sec-WebSocket-Version", "13")
            .body(())
            .map_err(|e| format!("Failed to build request: {}", e))?;

        let (ws_stream, _response) = connect_async(request)
            .await
            .map_err(|e| format!("WebSocket connection failed: {}", e))?;

        Ok(ws_stream)
    }

    /// Handle an active WebSocket connection
    async fn handle_connection(
        ws_stream: tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        audio_rx: &mut mpsc::Receiver<Vec<u8>>,
        transcript_tx: &mpsc::Sender<TranscriptEvent>,
        state: &Arc<RwLock<StreamState>>,
        is_streaming: &Arc<AtomicBool>,
        sample_rate: u32,
        channels: u16,
    ) -> String {
        let (mut write, mut read) = ws_stream.split();

        loop {
            tokio::select! {
                // Handle incoming WebSocket messages
                Some(msg) = read.next() => {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Some(event) = Self::parse_transcript(&text) {
                                // Update stats
                                {
                                    let mut state_guard = state.write().await;
                                    state_guard.stats.transcripts_received += 1;
                                }

                                // Send to receiver
                                if transcript_tx.send(event).await.is_err() {
                                    return "Transcript receiver dropped".to_string();
                                }
                            }
                        }
                        Ok(Message::Close(frame)) => {
                            let reason = frame
                                .map(|f| f.reason.to_string())
                                .unwrap_or_else(|| "No reason".to_string());
                            return format!("Server closed connection: {}", reason);
                        }
                        Ok(Message::Ping(data)) => {
                            // Respond to ping with pong
                            if write.send(Message::Pong(data)).await.is_err() {
                                return "Failed to send pong".to_string();
                            }
                        }
                        Err(e) => {
                            return format!("WebSocket error: {}", e);
                        }
                        _ => {}
                    }
                }

                // Handle outgoing audio data
                Some(audio_data) = audio_rx.recv() => {
                    let bytes_len = audio_data.len();

                    // Send audio as binary message
                    if let Err(e) = write.send(Message::Binary(audio_data)).await {
                        tracing::error!("Failed to send audio: {}", e);
                        return format!("Failed to send audio: {}", e);
                    }

                    // Update stats
                    {
                        let mut state_guard = state.write().await;
                        state_guard.stats.bytes_sent += bytes_len as u64;
                        // Calculate duration: bytes / (sample_rate * 2 bytes per sample * channels)
                        state_guard.stats.duration_sent +=
                            bytes_len as f64 / (sample_rate as f64 * 2.0 * channels as f64);
                    }
                }

                // Check if we should stop
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                    if !is_streaming.load(Ordering::SeqCst) {
                        // Send close frame
                        let _ = write.send(Message::Close(None)).await;
                        return "Streaming stopped by user".to_string();
                    }
                }
            }
        }
    }

    /// Parse a Deepgram JSON response into a TranscriptEvent
    fn parse_transcript(json_str: &str) -> Option<TranscriptEvent> {
        let value: serde_json::Value = serde_json::from_str(json_str).ok()?;

        // Check if this is a transcript result
        let result_type = value.get("type")?.as_str()?;
        if result_type != "Results" {
            return None;
        }

        let channel = value.get("channel_index")?.as_array()?.first()?.as_u64()? as u32;

        let channel_data = value.get("channel")?.get("alternatives")?.as_array()?;

        if channel_data.is_empty() {
            return None;
        }

        let alternative = &channel_data[0];
        let transcript = alternative.get("transcript")?.as_str()?.to_string();

        // Skip empty transcripts
        if transcript.trim().is_empty() {
            return None;
        }

        let confidence = alternative
            .get("confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;

        let words: Vec<Word> = alternative
            .get("words")
            .and_then(|w| w.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|w| {
                        Some(Word {
                            word: w.get("word")?.as_str()?.to_string(),
                            start: w.get("start")?.as_f64()?,
                            end: w.get("end")?.as_f64()?,
                            confidence: w.get("confidence")?.as_f64()? as f32,
                            speaker: w.get("speaker").and_then(|s| s.as_u64()).map(|s| s as u32),
                            punctuated_word: w
                                .get("punctuated_word")
                                .and_then(|p| p.as_str())
                                .map(String::from),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let is_final = value
            .get("is_final")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let speech_final = value
            .get("speech_final")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let start = value.get("start").and_then(|v| v.as_f64()).unwrap_or(0.0);

        let duration = value
            .get("duration")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        Some(TranscriptEvent {
            text: transcript,
            is_final,
            confidence,
            words,
            start,
            duration,
            channel,
            speech_final,
        })
    }

    /// Stop the streaming session
    pub async fn stop_streaming(&self) {
        self.is_streaming.store(false, Ordering::SeqCst);

        let mut state = self.state.write().await;
        state.should_run = false;
    }

    /// Check if currently streaming
    pub fn is_streaming(&self) -> bool {
        self.is_streaming.load(Ordering::SeqCst)
    }

    /// Get current connection state
    pub async fn get_state(&self) -> ConnectionState {
        self.state.read().await.state
    }

    /// Get streaming statistics
    pub async fn get_stats(&self) -> StreamingStats {
        self.state.read().await.stats.clone()
    }

    /// Update configuration (only effective before next connection)
    pub fn update_config(&mut self, config: DeepgramConfig) {
        self.config = config;
    }

    /// Get current configuration
    pub fn get_config(&self) -> &DeepgramConfig {
        &self.config
    }
}

/// Generate a random WebSocket key
fn generate_websocket_key() -> String {
    use base64::Engine;
    let mut key = [0u8; 16];
    for byte in &mut key {
        *byte = rand::random();
    }
    base64::engine::general_purpose::STANDARD.encode(key)
}

/// State wrapper for Tauri managed state
pub struct DeepgramState {
    client: RwLock<Option<DeepgramClient>>,
    audio_tx: RwLock<Option<mpsc::Sender<Vec<u8>>>>,
    transcript_rx: RwLock<Option<mpsc::Receiver<TranscriptEvent>>>,
}

impl DeepgramState {
    /// Create a new Deepgram state
    pub fn new() -> Self {
        Self {
            client: RwLock::new(None),
            audio_tx: RwLock::new(None),
            transcript_rx: RwLock::new(None),
        }
    }

    /// Initialize the client with configuration
    pub async fn initialize(&self, config: DeepgramConfig) {
        let client = DeepgramClient::new(config);
        *self.client.write().await = Some(client);
    }

    /// Start streaming
    pub async fn start(&self) -> Result<()> {
        let client_guard = self.client.read().await;
        let client = client_guard
            .as_ref()
            .ok_or_else(|| Error::Config("Deepgram client not initialized".to_string()))?;

        let (audio_tx, transcript_rx) = client.start_streaming().await?;

        *self.audio_tx.write().await = Some(audio_tx);
        *self.transcript_rx.write().await = Some(transcript_rx);

        Ok(())
    }

    /// Send audio data
    pub async fn send_audio(&self, audio: Vec<u8>) -> Result<()> {
        let tx_guard = self.audio_tx.read().await;
        let tx = tx_guard
            .as_ref()
            .ok_or_else(|| Error::Config("Streaming not started".to_string()))?;

        tx.send(audio)
            .await
            .map_err(|_| Error::Config("Failed to send audio: channel closed".to_string()))
    }

    /// Receive next transcript
    pub async fn receive_transcript(&self) -> Option<TranscriptEvent> {
        let mut rx_guard = self.transcript_rx.write().await;
        if let Some(rx) = rx_guard.as_mut() {
            rx.recv().await
        } else {
            None
        }
    }

    /// Stop streaming
    pub async fn stop(&self) {
        if let Some(client) = self.client.read().await.as_ref() {
            client.stop_streaming().await;
        }

        *self.audio_tx.write().await = None;
        *self.transcript_rx.write().await = None;
    }

    /// Check if streaming
    pub async fn is_streaming(&self) -> bool {
        if let Some(client) = self.client.read().await.as_ref() {
            client.is_streaming()
        } else {
            false
        }
    }

    /// Get stats
    pub async fn get_stats(&self) -> Option<StreamingStats> {
        if let Some(client) = self.client.read().await.as_ref() {
            Some(client.get_stats().await)
        } else {
            None
        }
    }
}

impl Default for DeepgramState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = DeepgramConfig::default();
        assert_eq!(config.model, "nova-2");
        assert_eq!(config.language, "en-US");
        assert!(config.punctuate);
        assert!(config.interim_results);
        assert_eq!(config.sample_rate, 16000);
    }

    #[test]
    fn test_build_ws_url() {
        let config = DeepgramConfig {
            api_key: "test-key".to_string(),
            model: "nova-2".to_string(),
            language: "en-US".to_string(),
            punctuate: true,
            interim_results: true,
            smart_format: true,
            diarize: false,
            sample_rate: 16000,
            channels: 1,
            encoding: "linear16".to_string(),
            utterances: true,
            utt_split: Some(800),
            profanity_filter: false,
            redact: vec![],
            keywords: vec![],
            keywords_boost: None,
        };

        let client = DeepgramClient::new(config);
        let url = client.build_ws_url();

        assert!(url.starts_with("wss://api.deepgram.com/v1/listen?"));
        assert!(url.contains("model=nova-2"));
        assert!(url.contains("language=en-US"));
        assert!(url.contains("punctuate=true"));
        assert!(url.contains("interim_results=true"));
        assert!(url.contains("sample_rate=16000"));
    }

    #[test]
    fn test_parse_transcript() {
        let json = r#"{
            "type": "Results",
            "channel_index": [0],
            "is_final": true,
            "speech_final": true,
            "channel": {
                "alternatives": [{
                    "transcript": "Hello world",
                    "confidence": 0.95,
                    "words": [
                        {"word": "hello", "start": 0.0, "end": 0.5, "confidence": 0.96},
                        {"word": "world", "start": 0.5, "end": 1.0, "confidence": 0.94}
                    ]
                }]
            },
            "start": 0.0,
            "duration": 1.0
        }"#;

        let event = DeepgramClient::parse_transcript(json).unwrap();
        assert_eq!(event.text, "Hello world");
        assert!(event.is_final);
        assert!(event.speech_final);
        assert!((event.confidence - 0.95).abs() < f32::EPSILON);
        assert_eq!(event.words.len(), 2);
        assert_eq!(event.words[0].word, "hello");
    }

    #[test]
    fn test_connection_state() {
        let state = ConnectionState::Disconnected;
        assert_eq!(state, ConnectionState::Disconnected);

        let state = ConnectionState::Connected;
        assert_eq!(state, ConnectionState::Connected);
    }

    #[test]
    fn test_deepgram_state_new() {
        let state = DeepgramState::new();
        assert!(state.client.try_read().is_ok());
    }
}
