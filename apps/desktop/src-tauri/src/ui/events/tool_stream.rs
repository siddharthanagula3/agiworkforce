use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter};

/// Tool stream event types for real-time progress updates during tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolStreamEvent {
    /// Tool execution has started
    Started {
        tool_id: String,
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        parameters: Option<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        estimated_duration_ms: Option<u64>,
    },

    /// Progress update during tool execution (for percentage-based progress)
    Progress {
        tool_id: String,
        /// Progress value between 0.0 and 1.0
        progress: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        bytes_processed: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        bytes_total: Option<u64>,
    },

    /// Streaming output chunk (for tools that produce incremental output)
    OutputChunk {
        tool_id: String,
        chunk: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        chunk_type: Option<OutputChunkType>,
        /// Whether this is the final chunk
        #[serde(default)]
        is_final: bool,
    },

    /// Tool execution completed successfully
    Completed {
        tool_id: String,
        result: serde_json::Value,
        duration_ms: u64,
    },

    /// Tool execution failed
    Error {
        tool_id: String,
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error_code: Option<String>,
        duration_ms: u64,
        #[serde(default)]
        retryable: bool,
    },

    /// Tool execution was cancelled
    Cancelled {
        tool_id: String,
        reason: Option<String>,
        duration_ms: u64,
    },
}

/// Type of output chunk for streaming output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputChunkType {
    Stdout,
    Stderr,
    Log,
    Data,
    Binary,
}

/// Event wrapper for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStreamEventPayload {
    pub event: ToolStreamEvent,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

static ACTIVE_TOOL_STREAMS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

impl ToolStreamEvent {
    /// Get the tool_id from any event variant
    pub fn tool_id(&self) -> &str {
        match self {
            ToolStreamEvent::Started { tool_id, .. } => tool_id,
            ToolStreamEvent::Progress { tool_id, .. } => tool_id,
            ToolStreamEvent::OutputChunk { tool_id, .. } => tool_id,
            ToolStreamEvent::Completed { tool_id, .. } => tool_id,
            ToolStreamEvent::Error { tool_id, .. } => tool_id,
            ToolStreamEvent::Cancelled { tool_id, .. } => tool_id,
        }
    }

    /// Get the event type as a string
    pub fn event_type(&self) -> &'static str {
        match self {
            ToolStreamEvent::Started { .. } => "started",
            ToolStreamEvent::Progress { .. } => "progress",
            ToolStreamEvent::OutputChunk { .. } => "output_chunk",
            ToolStreamEvent::Completed { .. } => "completed",
            ToolStreamEvent::Error { .. } => "error",
            ToolStreamEvent::Cancelled { .. } => "cancelled",
        }
    }
}

/// Emit a tool stream event to the frontend
pub fn emit_tool_stream_event(app_handle: &AppHandle, event: ToolStreamEvent) {
    emit_tool_stream_event_with_context(app_handle, event, None, None);
}

/// Emit a tool stream event with optional session and agent context
pub fn emit_tool_stream_event_with_context(
    app_handle: &AppHandle,
    event: ToolStreamEvent,
    session_id: Option<String>,
    agent_id: Option<String>,
) {
    match &event {
        ToolStreamEvent::Started { tool_id, .. } => {
            ACTIVE_TOOL_STREAMS.lock().insert(tool_id.clone());
        }
        ToolStreamEvent::Completed { tool_id, .. }
        | ToolStreamEvent::Error { tool_id, .. }
        | ToolStreamEvent::Cancelled { tool_id, .. } => {
            ACTIVE_TOOL_STREAMS.lock().remove(tool_id);
        }
        ToolStreamEvent::Progress { .. } | ToolStreamEvent::OutputChunk { .. } => {}
    }

    let payload = ToolStreamEventPayload {
        event: event.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        session_id,
        agent_id,
    };

    if let Err(e) = app_handle.emit("agi:tool_stream", &payload) {
        tracing::error!(
            "[ToolStream] Failed to emit {} event for tool {}: {}",
            event.event_type(),
            event.tool_id(),
            e
        );
    } else {
        tracing::debug!(
            "[ToolStream] Emitted {} event for tool {}",
            event.event_type(),
            event.tool_id()
        );
    }
}

pub fn is_tool_active(tool_id: &str) -> bool {
    ACTIVE_TOOL_STREAMS.lock().contains(tool_id)
}

/// Helper to emit a started event
pub fn emit_tool_started(
    app_handle: &AppHandle,
    tool_id: &str,
    tool_name: &str,
    parameters: Option<serde_json::Value>,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Started {
            tool_id: tool_id.to_string(),
            tool_name: tool_name.to_string(),
            parameters,
            estimated_duration_ms: None,
        },
    );
}

/// Helper to emit a progress event
pub fn emit_tool_progress(
    app_handle: &AppHandle,
    tool_id: &str,
    progress: f32,
    message: Option<&str>,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Progress {
            tool_id: tool_id.to_string(),
            progress: progress.clamp(0.0, 1.0),
            message: message.map(|s| s.to_string()),
            bytes_processed: None,
            bytes_total: None,
        },
    );
}

/// Helper to emit a progress event with byte counts (for file/network operations)
pub fn emit_tool_progress_bytes(
    app_handle: &AppHandle,
    tool_id: &str,
    bytes_processed: u64,
    bytes_total: u64,
    message: Option<&str>,
) {
    let progress = if bytes_total > 0 {
        bytes_processed as f32 / bytes_total as f32
    } else {
        0.0
    };

    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Progress {
            tool_id: tool_id.to_string(),
            progress: progress.clamp(0.0, 1.0),
            message: message.map(|s| s.to_string()),
            bytes_processed: Some(bytes_processed),
            bytes_total: Some(bytes_total),
        },
    );
}

/// Helper to emit an output chunk event
pub fn emit_tool_output_chunk(
    app_handle: &AppHandle,
    tool_id: &str,
    chunk: &str,
    chunk_type: OutputChunkType,
    is_final: bool,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::OutputChunk {
            tool_id: tool_id.to_string(),
            chunk: chunk.to_string(),
            chunk_type: Some(chunk_type),
            is_final,
        },
    );
}

/// Helper to emit a completed event
pub fn emit_tool_completed(
    app_handle: &AppHandle,
    tool_id: &str,
    result: serde_json::Value,
    duration_ms: u64,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Completed {
            tool_id: tool_id.to_string(),
            result,
            duration_ms,
        },
    );
}

/// Helper to emit an error event
pub fn emit_tool_error(
    app_handle: &AppHandle,
    tool_id: &str,
    error: &str,
    duration_ms: u64,
    retryable: bool,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Error {
            tool_id: tool_id.to_string(),
            error: error.to_string(),
            error_code: None,
            duration_ms,
            retryable,
        },
    );
}

/// Helper to emit a cancelled event
pub fn emit_tool_cancelled(
    app_handle: &AppHandle,
    tool_id: &str,
    reason: Option<&str>,
    duration_ms: u64,
) {
    emit_tool_stream_event(
        app_handle,
        ToolStreamEvent::Cancelled {
            tool_id: tool_id.to_string(),
            reason: reason.map(|s| s.to_string()),
            duration_ms,
        },
    );
}

/// A streaming tool execution context that manages emitting events
pub struct ToolStreamContext<'a> {
    app_handle: &'a AppHandle,
    tool_id: String,
    start_time: std::time::Instant,
    session_id: Option<String>,
    agent_id: Option<String>,
    output_buffer: String,
}

impl<'a> ToolStreamContext<'a> {
    /// Create a new streaming context and emit the started event
    pub fn new(
        app_handle: &'a AppHandle,
        tool_id: impl Into<String>,
        tool_name: impl Into<String>,
        parameters: Option<serde_json::Value>,
    ) -> Self {
        let tool_id = tool_id.into();
        let tool_name = tool_name.into();

        emit_tool_stream_event_with_context(
            app_handle,
            ToolStreamEvent::Started {
                tool_id: tool_id.clone(),
                tool_name: tool_name.clone(),
                parameters,
                estimated_duration_ms: None,
            },
            None,
            None,
        );

        Self {
            app_handle,
            tool_id,
            start_time: std::time::Instant::now(),
            session_id: None,
            agent_id: None,
            output_buffer: String::new(),
        }
    }

    /// Set the session ID for context
    pub fn with_session_id(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// Set the agent ID for context
    pub fn with_agent_id(mut self, agent_id: impl Into<String>) -> Self {
        self.agent_id = Some(agent_id.into());
        self
    }

    /// Report progress (0.0 - 1.0)
    pub fn progress(&self, progress: f32, message: Option<&str>) {
        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::Progress {
                tool_id: self.tool_id.clone(),
                progress: progress.clamp(0.0, 1.0),
                message: message.map(|s| s.to_string()),
                bytes_processed: None,
                bytes_total: None,
            },
            self.session_id.clone(),
            self.agent_id.clone(),
        );
    }

    /// Report progress with byte counts
    pub fn progress_bytes(&self, bytes_processed: u64, bytes_total: u64, message: Option<&str>) {
        let progress = if bytes_total > 0 {
            bytes_processed as f32 / bytes_total as f32
        } else {
            0.0
        };

        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::Progress {
                tool_id: self.tool_id.clone(),
                progress: progress.clamp(0.0, 1.0),
                message: message.map(|s| s.to_string()),
                bytes_processed: Some(bytes_processed),
                bytes_total: Some(bytes_total),
            },
            self.session_id.clone(),
            self.agent_id.clone(),
        );
    }

    /// Emit an output chunk
    pub fn output(&mut self, chunk: &str, chunk_type: OutputChunkType) {
        self.output_buffer.push_str(chunk);
        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::OutputChunk {
                tool_id: self.tool_id.clone(),
                chunk: chunk.to_string(),
                chunk_type: Some(chunk_type),
                is_final: false,
            },
            self.session_id.clone(),
            self.agent_id.clone(),
        );
    }

    /// Emit stdout output
    pub fn stdout(&mut self, chunk: &str) {
        self.output(chunk, OutputChunkType::Stdout);
    }

    /// Emit stderr output
    pub fn stderr(&mut self, chunk: &str) {
        self.output(chunk, OutputChunkType::Stderr);
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }

    /// Get the accumulated output buffer
    pub fn output_buffer(&self) -> &str {
        &self.output_buffer
    }

    /// Complete the tool execution successfully
    pub fn complete(self, result: serde_json::Value) {
        let duration_ms = self.elapsed_ms();
        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::Completed {
                tool_id: self.tool_id,
                result,
                duration_ms,
            },
            self.session_id,
            self.agent_id,
        );
    }

    /// Report an error
    pub fn error(self, error: &str, retryable: bool) {
        let duration_ms = self.elapsed_ms();
        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::Error {
                tool_id: self.tool_id,
                error: error.to_string(),
                error_code: None,
                duration_ms,
                retryable,
            },
            self.session_id,
            self.agent_id,
        );
    }

    /// Cancel the tool execution
    pub fn cancel(self, reason: Option<&str>) {
        let duration_ms = self.elapsed_ms();
        emit_tool_stream_event_with_context(
            self.app_handle,
            ToolStreamEvent::Cancelled {
                tool_id: self.tool_id,
                reason: reason.map(|s| s.to_string()),
                duration_ms,
            },
            self.session_id,
            self.agent_id,
        );
    }
}
