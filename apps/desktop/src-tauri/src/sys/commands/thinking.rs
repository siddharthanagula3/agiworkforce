//! Events that carry a model's extended thinking to the renderer while a
//! reply streams.

use crate::core::llm::thinking::ThinkingEvent;
use tauri::{AppHandle, Emitter};

/// Emit a thinking event to the frontend.
/// This is called internally when streaming thinking content.
pub fn emit_thinking_event(app: &AppHandle, event: ThinkingEvent) {
    if let Err(e) = app.emit("thinking:event", &event) {
        tracing::warn!("Failed to emit thinking event: {}", e);
    }
}

/// Emit a thinking start event.
pub fn emit_thinking_start(app: &AppHandle, message_id: Option<String>) {
    emit_thinking_event(app, ThinkingEvent::start(message_id));
}

/// Emit a thinking delta event.
pub fn emit_thinking_delta(app: &AppHandle, content: String, message_id: Option<String>) {
    emit_thinking_event(app, ThinkingEvent::delta(content, message_id));
}

/// Emit a thinking complete event.
pub fn emit_thinking_complete(
    app: &AppHandle,
    content: String,
    tokens: Option<u32>,
    message_id: Option<String>,
) {
    emit_thinking_event(app, ThinkingEvent::complete(content, tokens, message_id));
}
