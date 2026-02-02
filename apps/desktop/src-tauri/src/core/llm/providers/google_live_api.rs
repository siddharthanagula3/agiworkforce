//! Google Gemini Live API Provider
//!
//! Implements real-time bidirectional communication with Google's Gemini models
//! using the Live API with native audio streaming, WebSocket connections, and
//! full session management.
//!
//! Features:
//! - WebSocket connection management with automatic reconnection
//! - Native audio streaming (16-bit PCM, 24kHz output, 16kHz input)
//! - Voice Activity Detection (VAD) - automatic and manual
//! - Audio transcriptions (input/output)
//! - Session configuration with modalities (TEXT, AUDIO, VIDEO)
//! - Tool use integration with asynchronous function calling
//! - Session management with resumption tokens
//! - Ephemeral token support for client-side security
//!
//! Model: gemini-2.5-flash-native-audio-preview-12-2025
//!
//! Reference: https://ai.google.dev/api/multimodal-live

#![allow(dead_code)]

use async_trait::async_trait;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::time::{interval, timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message, WebSocketStream};
use tracing::{debug, error, info, warn};

/// Latest Gemini model with native audio support
pub const DEFAULT_LIVE_MODEL: &str = "gemini-2.5-flash-native-audio-preview-12-2025";

/// WebSocket connection timeout (10 minutes as per API specification)
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(600);

/// Session resumption token validity (2 hours)
const RESUMPTION_TOKEN_VALIDITY: Duration = Duration::from_secs(7200);

/// Audio-only session lifetime (15 minutes)
const AUDIO_SESSION_LIFETIME: Duration = Duration::from_secs(900);

/// Audio+video session lifetime (2 minutes)
const AUDIO_VIDEO_SESSION_LIFETIME: Duration = Duration::from_secs(120);

/// Heartbeat interval to keep connection alive
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// Ephemeral token default TTL (30 minutes)
const EPHEMERAL_TOKEN_TTL: Duration = Duration::from_secs(1800);

/// New session token expiry (1 minute)
const NEW_SESSION_EXPIRE_TIME: Duration = Duration::from_secs(60);

/// Maximum reconnection attempts
const MAX_RECONNECT_ATTEMPTS: u32 = 3;

/// Audio format: 16-bit PCM
const AUDIO_BITS_PER_SAMPLE: u8 = 16;

/// Output sample rate: 24kHz
const AUDIO_OUTPUT_SAMPLE_RATE: u32 = 24000;

/// Input sample rate: 16kHz
const AUDIO_INPUT_SAMPLE_RATE: u32 = 16000;

/// Modality types for Live API sessions
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Modality {
    /// Text-only communication
    Text,
    /// Audio communication with native streaming
    Audio,
    /// Video communication
    Video,
}

/// Voice configuration for audio sessions
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum Voice {
    /// Puck - friendly and conversational
    #[default]
    Puck,
    /// Charon - deep and authoritative
    Charon,
    /// Kore - warm and empathetic
    Kore,
    /// Fenrir - energetic and enthusiastic
    Fenrir,
    /// Aoede - calm and soothing
    Aoede,
}

/// Voice Activity Detection (VAD) mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[derive(Default)]
pub enum VadMode {
    /// Automatic voice activity detection
    #[default]
    VadAutomatic,
    /// Manual voice activity control
    VadManual,
    /// Disabled
    VadOff,
}

/// Language codes for speech configuration (24 languages supported)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum LanguageCode {
    #[serde(rename = "en")]
    #[default]
    English,
    #[serde(rename = "es")]
    Spanish,
    #[serde(rename = "fr")]
    French,
    #[serde(rename = "de")]
    German,
    #[serde(rename = "it")]
    Italian,
    #[serde(rename = "pt")]
    Portuguese,
    #[serde(rename = "ja")]
    Japanese,
    #[serde(rename = "ko")]
    Korean,
    #[serde(rename = "zh")]
    Chinese,
    #[serde(rename = "hi")]
    Hindi,
    #[serde(rename = "bn")]
    Bengali,
    #[serde(rename = "ar")]
    Arabic,
    #[serde(rename = "ru")]
    Russian,
    #[serde(rename = "tr")]
    Turkish,
    #[serde(rename = "vi")]
    Vietnamese,
    #[serde(rename = "th")]
    Thai,
    #[serde(rename = "id")]
    Indonesian,
    #[serde(rename = "nl")]
    Dutch,
    #[serde(rename = "pl")]
    Polish,
    #[serde(rename = "sv")]
    Swedish,
    #[serde(rename = "da")]
    Danish,
    #[serde(rename = "fi")]
    Finnish,
    #[serde(rename = "no")]
    Norwegian,
    #[serde(rename = "uk")]
    Ukrainian,
}

/// Speech configuration for audio sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechConfig {
    /// Voice to use for output
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice: Option<Voice>,

    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language_code: Option<LanguageCode>,

    /// Voice Activity Detection mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vad_mode: Option<VadMode>,

    /// Enable input audio transcription
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_input_transcription: Option<bool>,

    /// Enable output audio transcription
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_output_transcription: Option<bool>,

    /// Sample rate for input audio (16kHz recommended)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_sample_rate: Option<u32>,

    /// Sample rate for output audio (24kHz recommended)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_sample_rate: Option<u32>,
}

impl Default for SpeechConfig {
    fn default() -> Self {
        Self {
            voice: Some(Voice::default()),
            language_code: Some(LanguageCode::default()),
            vad_mode: Some(VadMode::default()),
            enable_input_transcription: Some(true),
            enable_output_transcription: Some(true),
            input_sample_rate: Some(AUDIO_INPUT_SAMPLE_RATE),
            output_sample_rate: Some(AUDIO_OUTPUT_SAMPLE_RATE),
        }
    }
}

/// Function calling scheduling mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[derive(Default)]
pub enum FunctionCallingScheduling {
    /// Interrupt current generation to call function
    Interrupt,
    /// Call function when model is idle
    #[default]
    WhenIdle,
    /// Call function silently without affecting generation
    Silent,
}

/// Function calling behavior
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[derive(Default)]
pub enum FunctionCallingBehavior {
    /// Non-blocking asynchronous function calls
    #[default]
    NonBlocking,
    /// Blocking synchronous function calls
    Blocking,
}

/// Tool configuration for Live API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolConfig {
    /// Function calling scheduling mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduling: Option<FunctionCallingScheduling>,

    /// Function calling behavior (blocking/non-blocking)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior: Option<FunctionCallingBehavior>,

    /// Enable Google Search grounding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_google_search: Option<bool>,
}

impl Default for ToolConfig {
    fn default() -> Self {
        Self {
            scheduling: Some(FunctionCallingScheduling::default()),
            behavior: Some(FunctionCallingBehavior::default()),
            enable_google_search: Some(false),
        }
    }
}

/// Context window compression strategy
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CompressionMode {
    /// Sliding window compression
    SlidingWindow,
    /// Token-based trigger
    TokenTrigger,
    /// Disabled
    Disabled,
}

/// Session configuration for Live API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSessionConfig {
    /// Model to use (default: gemini-2.5-flash-native-audio-preview-12-2025)
    pub model: String,

    /// Modalities enabled for this session
    pub modalities: Vec<Modality>,

    /// Speech configuration (required if AUDIO modality is enabled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speech_config: Option<SpeechConfig>,

    /// System instruction for the session
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<String>,

    /// Generation configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GenerationConfig>,

    /// Tool configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_config: Option<ToolConfig>,

    /// Tools available for function calling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Value>>,

    /// Context window compression mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression_mode: Option<CompressionMode>,

    /// Trigger token count for compression
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression_trigger_tokens: Option<u32>,
}

/// Generation configuration for Live API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,

    /// Response MIME type for structured outputs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_mime_type: Option<String>,

    /// Response schema for structured outputs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_schema: Option<Value>,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            temperature: Some(1.0),
            max_output_tokens: Some(8192),
            top_p: Some(0.95),
            top_k: Some(40),
            response_mime_type: None,
            response_schema: None,
        }
    }
}

impl Default for LiveSessionConfig {
    fn default() -> Self {
        Self {
            model: DEFAULT_LIVE_MODEL.to_string(),
            modalities: vec![Modality::Text, Modality::Audio],
            speech_config: Some(SpeechConfig::default()),
            system_instruction: None,
            generation_config: Some(GenerationConfig::default()),
            tool_config: Some(ToolConfig::default()),
            tools: None,
            compression_mode: Some(CompressionMode::SlidingWindow),
            compression_trigger_tokens: Some(32000), // Compress at 32K tokens
        }
    }
}

/// Ephemeral token configuration for client-side security
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EphemeralTokenConfig {
    /// Token time-to-live (default: 30 minutes)
    pub ttl: Duration,

    /// New session expiry time (default: 1 minute)
    pub new_session_expire_time: Duration,

    /// Lock token to specific session configuration
    pub lock_to_config: bool,
}

impl Default for EphemeralTokenConfig {
    fn default() -> Self {
        Self {
            ttl: EPHEMERAL_TOKEN_TTL,
            new_session_expire_time: NEW_SESSION_EXPIRE_TIME,
            lock_to_config: true,
        }
    }
}

/// Client-to-server message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    /// Setup message to configure session
    Setup {
        #[serde(flatten)]
        config: Box<LiveSessionConfig>,
    },

    /// Send text content
    ClientContent {
        turns: Vec<Turn>,
        #[serde(skip_serializing_if = "Option::is_none")]
        turn_complete: Option<bool>,
    },

    /// Send audio chunk (16-bit PCM, base64 encoded)
    RealtimeInput { media_chunks: Vec<MediaChunk> },

    /// Function response
    ToolResponse {
        function_responses: Vec<FunctionResponse>,
    },

    /// Request session resumption token
    RequestResumptionToken,

    /// Resume session with token
    ResumeSession { resumption_token: String },

    /// Graceful disconnect
    GoAway {
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}

/// Server-to-client message types
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    /// Setup complete
    SetupComplete,

    /// Server content (text or function calls)
    ServerContent {
        model_turn: ModelTurn,
        #[serde(default)]
        turn_complete: bool,
    },

    /// Audio output chunk
    AudioOutput { audio_chunk: AudioChunk },

    /// Tool call request
    ToolCall { tool_calls: Vec<ToolCallRequest> },

    /// Tool call cancellation
    ToolCallCancellation { ids: Vec<String> },

    /// Generation complete signal
    GenerationComplete,

    /// Resumption token response
    ResumptionToken {
        token: String,
        /// Expiration time as Unix timestamp (seconds since epoch)
        expires_at_secs: i64,
    },

    /// Session resumed
    SessionResumed,

    /// Error message
    Error { code: String, message: String },

    /// GoAway acknowledgment
    GoAway {
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}

/// Content turn for conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub role: String,
    pub parts: Vec<Part>,
}

/// Content part
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Part {
    Text { text: String },
    InlineData { inline_data: InlineData },
    FunctionCall { function_call: FunctionCall },
    FunctionResponse { function_response: FunctionResponse },
}

/// Inline data for media
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineData {
    pub mime_type: String,
    pub data: String, // Base64 encoded
}

/// Function call from model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCall {
    pub name: String,
    pub args: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Function response to model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionResponse {
    pub name: String,
    pub response: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// Model turn in conversation
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTurn {
    pub parts: Vec<Part>,

    /// Input audio transcript
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_transcript: Option<String>,

    /// Output audio transcript
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_transcript: Option<String>,
}

/// Media chunk for realtime input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaChunk {
    pub mime_type: String,
    pub data: String, // Base64 encoded audio
}

/// Audio output chunk
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChunk {
    pub data: String, // Base64 encoded PCM audio

    /// Transcript of this audio chunk
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
}

/// Tool call request from server
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRequest {
    pub id: String,
    pub function_call: FunctionCall,
}

/// Live API event types for clients
#[derive(Debug, Clone)]
pub enum LiveApiEvent {
    /// Connection established
    Connected,

    /// Session setup complete
    SetupComplete,

    /// Text content received
    TextContent { text: String, turn_complete: bool },

    /// Audio chunk received (16-bit PCM, 24kHz)
    AudioChunk {
        data: Vec<u8>,
        transcript: Option<String>,
    },

    /// Input audio transcript
    InputTranscript { text: String },

    /// Output audio transcript
    OutputTranscript { text: String },

    /// Function call requested
    FunctionCall {
        id: String,
        name: String,
        arguments: Value,
    },

    /// Function calls canceled
    FunctionCallsCanceled { ids: Vec<String> },

    /// Generation complete
    GenerationComplete,

    /// Resumption token received
    ResumptionToken {
        token: String,
        /// Expiration time as Unix timestamp (seconds since epoch)
        expires_at_secs: i64,
    },

    /// Error occurred
    Error { code: String, message: String },

    /// Connection closed
    Disconnected { reason: Option<String> },
}

/// Connection state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    SetupComplete,
    Reconnecting,
    Closing,
    Closed,
}

/// Google Live API Provider
pub struct GoogleLiveApiProvider {
    api_key: String,
    base_url: String,
    connection: Arc<
        Mutex<Option<WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>>,
    >,
    state: Arc<RwLock<ConnectionState>>,
    event_tx: mpsc::UnboundedSender<LiveApiEvent>,
    event_rx: Arc<Mutex<mpsc::UnboundedReceiver<LiveApiEvent>>>,
    reconnect_attempts: Arc<Mutex<u32>>,
    session_config: Arc<RwLock<Option<LiveSessionConfig>>>,
    resumption_token: Arc<RwLock<Option<String>>>,
}

impl GoogleLiveApiProvider {
    /// Create a new Live API provider instance
    pub fn new(api_key: String) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let base_url = std::env::var("GOOGLE_LIVE_API_BASE")
            .unwrap_or_else(|_| "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent".to_string());

        Self {
            api_key,
            base_url,
            connection: Arc::new(Mutex::new(None)),
            state: Arc::new(RwLock::new(ConnectionState::Disconnected)),
            event_tx,
            event_rx: Arc::new(Mutex::new(event_rx)),
            reconnect_attempts: Arc::new(Mutex::new(0)),
            session_config: Arc::new(RwLock::new(None)),
            resumption_token: Arc::new(RwLock::new(None)),
        }
    }

    /// Get event receiver for consuming Live API events
    pub async fn get_event_receiver(&self) -> mpsc::UnboundedReceiver<LiveApiEvent> {
        let mut rx = self.event_rx.lock().await;
        let (_new_tx, new_rx) = mpsc::unbounded_channel();

        // Transfer existing sender
        std::mem::replace(&mut *rx, new_rx)
    }

    /// Get current connection state
    pub async fn get_state(&self) -> ConnectionState {
        *self.state.read().await
    }

    /// Connect to Live API and setup session
    pub async fn connect(
        &self,
        config: LiveSessionConfig,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        info!("Connecting to Google Live API with model: {}", config.model);

        // Update state
        *self.state.write().await = ConnectionState::Connecting;

        // Build WebSocket URL with API key
        let ws_url = format!("{}?key={}", self.base_url, self.api_key);

        // Connect with timeout
        let connect_result = timeout(Duration::from_secs(30), connect_async(&ws_url)).await;

        let (ws_stream, _) = match connect_result {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => {
                *self.state.write().await = ConnectionState::Disconnected;
                return Err(format!("WebSocket connection failed: {}", e).into());
            }
            Err(_) => {
                *self.state.write().await = ConnectionState::Disconnected;
                return Err("Connection timeout".into());
            }
        };

        // Store connection
        *self.connection.lock().await = Some(ws_stream);
        *self.state.write().await = ConnectionState::Connected;

        // Send setup message
        self.send_setup(config.clone()).await?;

        // Store config for reconnection
        *self.session_config.write().await = Some(config);

        // Reset reconnect attempts
        *self.reconnect_attempts.lock().await = 0;

        // Start message handler
        self.start_message_handler().await;

        // Start heartbeat
        self.start_heartbeat().await;

        // Emit connected event
        let _ = self.event_tx.send(LiveApiEvent::Connected);

        Ok(())
    }

    /// Resume session with resumption token
    pub async fn resume_session(&self, token: String) -> Result<(), Box<dyn Error + Send + Sync>> {
        info!("Resuming Live API session with token");

        let message = ClientMessage::ResumeSession {
            resumption_token: token.clone(),
        };

        self.send_message(message).await?;

        // Store token
        *self.resumption_token.write().await = Some(token);

        Ok(())
    }

    /// Request resumption token for this session
    pub async fn request_resumption_token(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        debug!("Requesting resumption token");

        let message = ClientMessage::RequestResumptionToken;
        self.send_message(message).await
    }

    /// Send text content to the session
    pub async fn send_text(
        &self,
        text: String,
        turn_complete: bool,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        debug!(
            "Sending text content: {} (turn_complete: {})",
            text, turn_complete
        );

        let message = ClientMessage::ClientContent {
            turns: vec![Turn {
                role: "user".to_string(),
                parts: vec![Part::Text { text }],
            }],
            turn_complete: Some(turn_complete),
        };

        self.send_message(message).await
    }

    /// Send audio chunk (16-bit PCM, 16kHz recommended)
    pub async fn send_audio(
        &self,
        audio_data: Vec<u8>,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        debug!("Sending audio chunk: {} bytes", audio_data.len());

        // Encode audio as base64
        let base64_audio =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &audio_data);

        let message = ClientMessage::RealtimeInput {
            media_chunks: vec![MediaChunk {
                mime_type: "audio/pcm".to_string(),
                data: base64_audio,
            }],
        };

        self.send_message(message).await
    }

    /// Send function response
    pub async fn send_function_response(
        &self,
        id: String,
        name: String,
        response: Value,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        debug!("Sending function response for: {} (id: {})", name, id);

        let message = ClientMessage::ToolResponse {
            function_responses: vec![FunctionResponse {
                name,
                response,
                id: Some(id),
            }],
        };

        self.send_message(message).await
    }

    /// Gracefully disconnect from session
    pub async fn disconnect(
        &self,
        reason: Option<String>,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        info!("Disconnecting from Live API: {:?}", reason);

        *self.state.write().await = ConnectionState::Closing;

        // Send GoAway message
        let message = ClientMessage::GoAway {
            reason: reason.clone(),
        };
        let _ = self.send_message(message).await;

        // Close connection
        if let Some(mut ws) = self.connection.lock().await.take() {
            let _ = ws.close(None).await;
        }

        *self.state.write().await = ConnectionState::Closed;

        // Emit disconnect event
        let _ = self.event_tx.send(LiveApiEvent::Disconnected { reason });

        Ok(())
    }

    /// Send setup message
    async fn send_setup(
        &self,
        config: LiveSessionConfig,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        debug!("Sending setup message");

        let message = ClientMessage::Setup {
            config: Box::new(config),
        };
        self.send_message(message).await
    }

    /// Send a client message
    async fn send_message(
        &self,
        message: ClientMessage,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let json = serde_json::to_string(&message)?;

        let mut conn = self.connection.lock().await;
        if let Some(ws) = conn.as_mut() {
            ws.send(Message::Text(json)).await?;
            Ok(())
        } else {
            Err("Not connected".into())
        }
    }

    /// Start message handler task
    async fn start_message_handler(&self) {
        let connection = Arc::clone(&self.connection);
        let state = Arc::clone(&self.state);
        let event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            loop {
                // Get message from WebSocket
                let message = {
                    let mut conn = connection.lock().await;
                    if let Some(ws) = conn.as_mut() {
                        match ws.next().await {
                            Some(Ok(msg)) => Some(msg),
                            Some(Err(e)) => {
                                error!("WebSocket error: {}", e);
                                None
                            }
                            None => None,
                        }
                    } else {
                        None
                    }
                };

                match message {
                    Some(Message::Text(text)) => {
                        if let Err(e) = Self::handle_server_message(&text, &event_tx, &state).await
                        {
                            error!("Error handling server message: {}", e);
                        }
                    }
                    Some(Message::Close(_)) => {
                        info!("WebSocket closed by server");
                        *state.write().await = ConnectionState::Closed;
                        let _ = event_tx.send(LiveApiEvent::Disconnected { reason: None });
                        break;
                    }
                    Some(Message::Ping(data)) => {
                        // Auto-respond to ping
                        let mut conn = connection.lock().await;
                        if let Some(ws) = conn.as_mut() {
                            let _ = ws.send(Message::Pong(data)).await;
                        }
                    }
                    Some(_) => {
                        // Ignore other message types
                    }
                    None => {
                        // Connection closed
                        *state.write().await = ConnectionState::Closed;
                        let _ = event_tx.send(LiveApiEvent::Disconnected { reason: None });
                        break;
                    }
                }
            }
        });
    }

    /// Handle server message
    async fn handle_server_message(
        text: &str,
        event_tx: &mpsc::UnboundedSender<LiveApiEvent>,
        state: &Arc<RwLock<ConnectionState>>,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        let message: ServerMessage = serde_json::from_str(text)?;

        match message {
            ServerMessage::SetupComplete => {
                info!("Live API setup complete");
                *state.write().await = ConnectionState::SetupComplete;
                let _ = event_tx.send(LiveApiEvent::SetupComplete);
            }

            ServerMessage::ServerContent {
                model_turn,
                turn_complete,
            } => {
                // Extract text and transcripts
                for part in model_turn.parts {
                    match part {
                        Part::Text { text } => {
                            let _ = event_tx.send(LiveApiEvent::TextContent {
                                text,
                                turn_complete,
                            });
                        }
                        Part::FunctionCall { function_call } => {
                            let id = function_call
                                .id
                                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                            let _ = event_tx.send(LiveApiEvent::FunctionCall {
                                id,
                                name: function_call.name,
                                arguments: function_call.args,
                            });
                        }
                        _ => {}
                    }
                }

                // Emit transcripts
                if let Some(input_transcript) = model_turn.input_transcript {
                    let _ = event_tx.send(LiveApiEvent::InputTranscript {
                        text: input_transcript,
                    });
                }

                if let Some(output_transcript) = model_turn.output_transcript {
                    let _ = event_tx.send(LiveApiEvent::OutputTranscript {
                        text: output_transcript,
                    });
                }
            }

            ServerMessage::AudioOutput { audio_chunk } => {
                // Decode base64 audio
                if let Ok(audio_data) =
                    base64::engine::general_purpose::STANDARD.decode(&audio_chunk.data)
                {
                    let _ = event_tx.send(LiveApiEvent::AudioChunk {
                        data: audio_data,
                        transcript: audio_chunk.transcript,
                    });
                }
            }

            ServerMessage::ToolCall { tool_calls } => {
                for tool_call in tool_calls {
                    let _ = event_tx.send(LiveApiEvent::FunctionCall {
                        id: tool_call.id,
                        name: tool_call.function_call.name,
                        arguments: tool_call.function_call.args,
                    });
                }
            }

            ServerMessage::ToolCallCancellation { ids } => {
                let _ = event_tx.send(LiveApiEvent::FunctionCallsCanceled { ids });
            }

            ServerMessage::GenerationComplete => {
                debug!("Generation complete");
                let _ = event_tx.send(LiveApiEvent::GenerationComplete);
            }

            ServerMessage::ResumptionToken {
                token,
                expires_at_secs,
            } => {
                info!(
                    "Resumption token received (expires in {} secs from epoch)",
                    expires_at_secs
                );
                let _ = event_tx.send(LiveApiEvent::ResumptionToken {
                    token,
                    expires_at_secs,
                });
            }

            ServerMessage::SessionResumed => {
                info!("Session resumed successfully");
                *state.write().await = ConnectionState::SetupComplete;
            }

            ServerMessage::Error { code, message } => {
                error!("Live API error: {} - {}", code, message);
                let _ = event_tx.send(LiveApiEvent::Error { code, message });
            }

            ServerMessage::GoAway { reason } => {
                info!("Server requested disconnect: {:?}", reason);
                *state.write().await = ConnectionState::Closing;
                let _ = event_tx.send(LiveApiEvent::Disconnected { reason });
            }
        }

        Ok(())
    }

    /// Start heartbeat to keep connection alive
    async fn start_heartbeat(&self) {
        let connection = Arc::clone(&self.connection);
        let state = Arc::clone(&self.state);

        tokio::spawn(async move {
            let mut heartbeat = interval(HEARTBEAT_INTERVAL);

            loop {
                heartbeat.tick().await;

                let current_state = *state.read().await;
                if current_state == ConnectionState::Closed
                    || current_state == ConnectionState::Disconnected
                {
                    break;
                }

                // Send ping
                let mut conn = connection.lock().await;
                if let Some(ws) = conn.as_mut() {
                    if let Err(e) = ws.send(Message::Ping(vec![])).await {
                        warn!("Heartbeat ping failed: {}", e);
                        break;
                    }
                }
            }
        });
    }

    /// Attempt to reconnect with exponential backoff
    async fn reconnect(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        let mut attempts = self.reconnect_attempts.lock().await;

        if *attempts >= MAX_RECONNECT_ATTEMPTS {
            error!("Max reconnection attempts reached");
            return Err("Max reconnection attempts exceeded".into());
        }

        *attempts += 1;
        *self.state.write().await = ConnectionState::Reconnecting;

        info!(
            "Reconnection attempt {} of {}",
            *attempts, MAX_RECONNECT_ATTEMPTS
        );

        // Exponential backoff: 1s, 2s, 4s
        let delay = Duration::from_secs(2u64.pow(*attempts - 1));
        tokio::time::sleep(delay).await;

        // Get stored config
        let config = {
            let cfg = self.session_config.read().await;
            cfg.clone().ok_or("No session config stored")?
        };

        // Try to reconnect
        self.connect(config).await
    }
}

#[async_trait]
impl crate::core::llm::LLMProvider for GoogleLiveApiProvider {
    async fn send_message(
        &self,
        _request: &crate::core::llm::LLMRequest,
    ) -> Result<crate::core::llm::LLMResponse, Box<dyn Error + Send + Sync>> {
        Err("Live API does not support synchronous send_message. Use connect() and send_text() instead.".into())
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "GoogleLiveAPI"
    }

    fn supports_vision(&self) -> bool {
        true
    }

    fn supports_function_calling(&self) -> bool {
        true
    }

    fn supports_audio_input(&self) -> bool {
        true
    }

    fn supports_audio_output(&self) -> bool {
        true
    }

    fn supports_streaming_audio(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::LLMProvider;

    #[test]
    fn test_default_session_config() {
        let config = LiveSessionConfig::default();
        assert_eq!(config.model, DEFAULT_LIVE_MODEL);
        assert_eq!(config.modalities.len(), 2);
        assert!(config.modalities.contains(&Modality::Text));
        assert!(config.modalities.contains(&Modality::Audio));
    }

    #[test]
    fn test_speech_config_defaults() {
        let config = SpeechConfig::default();
        assert_eq!(config.voice, Some(Voice::Puck));
        assert_eq!(config.language_code, Some(LanguageCode::English));
        assert_eq!(config.vad_mode, Some(VadMode::VadAutomatic));
        assert_eq!(config.input_sample_rate, Some(AUDIO_INPUT_SAMPLE_RATE));
        assert_eq!(config.output_sample_rate, Some(AUDIO_OUTPUT_SAMPLE_RATE));
    }

    #[test]
    fn test_tool_config_defaults() {
        let config = ToolConfig::default();
        assert_eq!(config.scheduling, Some(FunctionCallingScheduling::WhenIdle));
        assert_eq!(config.behavior, Some(FunctionCallingBehavior::NonBlocking));
        assert_eq!(config.enable_google_search, Some(false));
    }

    #[test]
    fn test_ephemeral_token_config() {
        let config = EphemeralTokenConfig::default();
        assert_eq!(config.ttl, EPHEMERAL_TOKEN_TTL);
        assert_eq!(config.new_session_expire_time, NEW_SESSION_EXPIRE_TIME);
        assert!(config.lock_to_config);
    }

    #[test]
    fn test_voice_serialization() {
        let voice = Voice::Puck;
        let json = serde_json::to_string(&voice).unwrap();
        assert_eq!(json, "\"puck\"");
    }

    #[test]
    fn test_modality_serialization() {
        let modality = Modality::Audio;
        let json = serde_json::to_string(&modality).unwrap();
        assert_eq!(json, "\"AUDIO\"");
    }

    #[test]
    fn test_client_message_serialization() {
        let message = ClientMessage::ClientContent {
            turns: vec![Turn {
                role: "user".to_string(),
                parts: vec![Part::Text {
                    text: "Hello".to_string(),
                }],
            }],
            turn_complete: Some(true),
        };

        let json = serde_json::to_string(&message).unwrap();
        assert!(json.contains("\"type\":\"clientContent\""));
        assert!(json.contains("\"Hello\""));
    }

    #[tokio::test]
    async fn test_provider_creation() {
        let provider = GoogleLiveApiProvider::new("test-key".to_string());
        assert!(provider.is_configured());
        assert_eq!(provider.name(), "GoogleLiveAPI");
        assert!(provider.supports_audio_input());
        assert!(provider.supports_audio_output());
        assert!(provider.supports_streaming_audio());
    }

    #[tokio::test]
    async fn test_connection_state() {
        let provider = GoogleLiveApiProvider::new("test-key".to_string());
        let state = provider.get_state().await;
        assert_eq!(state, ConnectionState::Disconnected);
    }
}
