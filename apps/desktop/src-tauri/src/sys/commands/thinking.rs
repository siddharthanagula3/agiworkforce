//! Tauri commands for Extended Thinking mode management.
//!
//! This module provides commands for managing Claude's extended thinking feature,
//! allowing the frontend to configure thinking budgets and receive thinking content.

use crate::core::llm::thinking::{ThinkingBudget, ThinkingConfig, ThinkingContent, ThinkingEvent};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

/// State for managing thinking mode configuration.
pub struct ThinkingState {
    /// Global thinking configuration (can be overridden per-request)
    config: Arc<RwLock<ThinkingConfig>>,
    /// Current thinking content being accumulated (for streaming)
    current_thinking: Arc<RwLock<Option<ThinkingContent>>>,
}

impl Default for ThinkingState {
    fn default() -> Self {
        Self::new()
    }
}

impl ThinkingState {
    /// Create a new thinking state with default configuration.
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(ThinkingConfig::default())),
            current_thinking: Arc::new(RwLock::new(None)),
        }
    }

    /// Get the current thinking configuration.
    pub async fn get_config(&self) -> ThinkingConfig {
        self.config.read().await.clone()
    }

    /// Set the thinking configuration.
    pub async fn set_config(&self, config: ThinkingConfig) {
        *self.config.write().await = config;
    }

    /// Start accumulating thinking content.
    pub async fn start_thinking(&self) {
        *self.current_thinking.write().await = Some(ThinkingContent::new(String::new()));
    }

    /// Append to the current thinking content.
    pub async fn append_thinking(&self, delta: &str) {
        if let Some(ref mut content) = *self.current_thinking.write().await {
            content.thinking.push_str(delta);
        }
    }

    /// Complete and retrieve the accumulated thinking content.
    pub async fn complete_thinking(&self) -> Option<ThinkingContent> {
        let mut guard = self.current_thinking.write().await;
        if let Some(ref mut content) = *guard {
            content.complete();
        }
        guard.take()
    }

    /// Get the current accumulated thinking content without completing.
    pub async fn get_current_thinking(&self) -> Option<ThinkingContent> {
        self.current_thinking.read().await.clone()
    }
}

/// Response for thinking configuration queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingConfigResponse {
    pub enabled: bool,
    pub budget: String,
    pub budget_tokens: u32,
    pub emit_thinking_events: bool,
    pub include_thinking_summary: bool,
}

impl From<ThinkingConfig> for ThinkingConfigResponse {
    fn from(config: ThinkingConfig) -> Self {
        let budget_str = match config.budget {
            ThinkingBudget::Low => "low".to_string(),
            ThinkingBudget::Medium => "medium".to_string(),
            ThinkingBudget::High => "high".to_string(),
            ThinkingBudget::Custom(tokens) => format!("custom:{}", tokens),
        };
        Self {
            enabled: config.enabled,
            budget: budget_str,
            budget_tokens: config.budget_tokens(),
            emit_thinking_events: config.emit_thinking_events,
            include_thinking_summary: config.include_thinking_summary,
        }
    }
}

/// Request to set thinking configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetThinkingConfigRequest {
    /// Enable or disable thinking mode
    pub enabled: Option<bool>,
    /// Budget level: "low", "medium", "high", or "custom:N" where N is token count
    pub budget: Option<String>,
    /// Whether to emit thinking events for UI visibility
    pub emit_thinking_events: Option<bool>,
    /// Whether to include thinking summary in response
    pub include_thinking_summary: Option<bool>,
}

/// Get the current thinking mode configuration.
#[tauri::command]
pub async fn thinking_get_config(
    state: State<'_, ThinkingState>,
) -> Result<ThinkingConfigResponse, String> {
    let config = state.get_config().await;
    Ok(config.into())
}

/// Set the thinking mode configuration.
#[tauri::command]
pub async fn thinking_set_config(
    request: SetThinkingConfigRequest,
    state: State<'_, ThinkingState>,
) -> Result<ThinkingConfigResponse, String> {
    let mut config = state.get_config().await;

    if let Some(enabled) = request.enabled {
        config.enabled = enabled;
    }

    if let Some(budget_str) = request.budget {
        config.budget = parse_budget(&budget_str)?;
    }

    if let Some(emit) = request.emit_thinking_events {
        config.emit_thinking_events = emit;
    }

    if let Some(summary) = request.include_thinking_summary {
        config.include_thinking_summary = summary;
    }

    state.set_config(config.clone()).await;
    Ok(config.into())
}

/// Toggle thinking mode on/off, returning the new state.
#[tauri::command]
pub async fn thinking_toggle(state: State<'_, ThinkingState>) -> Result<bool, String> {
    let mut config = state.get_config().await;
    config.enabled = !config.enabled;
    let new_state = config.enabled;
    state.set_config(config).await;
    Ok(new_state)
}

/// Set the thinking budget level.
/// Accepts: "low", "medium", "high", or a custom token count as a number.
#[tauri::command]
pub async fn thinking_set_budget(
    budget: String,
    state: State<'_, ThinkingState>,
) -> Result<ThinkingConfigResponse, String> {
    let mut config = state.get_config().await;
    config.budget = parse_budget(&budget)?;
    state.set_config(config.clone()).await;
    Ok(config.into())
}

/// Parse user message to detect thinking triggers and return configuration.
/// This can be used by the frontend to automatically enable thinking based on user input.
#[tauri::command]
pub async fn thinking_detect_trigger(message: String) -> Result<ThinkingConfigResponse, String> {
    let config = ThinkingConfig::from_user_message(&message);
    Ok(config.into())
}

/// Check if a model supports extended thinking.
#[tauri::command]
pub async fn thinking_model_supports(model: String) -> Result<bool, String> {
    Ok(ThinkingConfig::model_supports_thinking(&model))
}

/// Get the current accumulated thinking content (for long-running requests).
#[tauri::command]
pub async fn thinking_get_current(
    state: State<'_, ThinkingState>,
) -> Result<Option<ThinkingContent>, String> {
    Ok(state.get_current_thinking().await)
}

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

/// Parse a budget string into a ThinkingBudget.
fn parse_budget(budget_str: &str) -> Result<ThinkingBudget, String> {
    let lower = budget_str.to_lowercase();

    // Check for named budgets
    match lower.as_str() {
        "low" => return Ok(ThinkingBudget::Low),
        "medium" => return Ok(ThinkingBudget::Medium),
        "high" => return Ok(ThinkingBudget::High),
        _ => {}
    }

    // Check for custom:N format
    if let Some(tokens_str) = lower.strip_prefix("custom:") {
        let tokens: u32 = tokens_str
            .parse()
            .map_err(|_| format!("Invalid custom token count: {}", tokens_str))?;
        return Ok(ThinkingBudget::Custom(tokens));
    }

    // Try parsing as a direct number
    if let Ok(tokens) = budget_str.parse::<u32>() {
        return Ok(ThinkingBudget::Custom(tokens));
    }

    Err(format!(
        "Invalid budget: '{}'. Use 'low', 'medium', 'high', or a number",
        budget_str
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_budget() {
        assert_eq!(parse_budget("low").unwrap(), ThinkingBudget::Low);
        assert_eq!(parse_budget("MEDIUM").unwrap(), ThinkingBudget::Medium);
        assert_eq!(parse_budget("High").unwrap(), ThinkingBudget::High);
        assert_eq!(
            parse_budget("custom:50000").unwrap(),
            ThinkingBudget::Custom(50000)
        );
        assert_eq!(
            parse_budget("25000").unwrap(),
            ThinkingBudget::Custom(25000)
        );

        assert!(parse_budget("invalid").is_err());
        assert!(parse_budget("custom:abc").is_err());
    }

    #[tokio::test]
    async fn test_thinking_state() {
        let state = ThinkingState::new();

        // Check default config
        let config = state.get_config().await;
        assert!(!config.enabled);

        // Enable thinking
        let mut new_config = config.clone();
        new_config.enabled = true;
        new_config.budget = ThinkingBudget::Medium;
        state.set_config(new_config).await;

        let updated = state.get_config().await;
        assert!(updated.enabled);
        assert_eq!(updated.budget, ThinkingBudget::Medium);
    }

    #[tokio::test]
    async fn test_thinking_accumulation() {
        let state = ThinkingState::new();

        // Start thinking
        state.start_thinking().await;

        // Append content
        state.append_thinking("Step 1: Analyze...").await;
        state.append_thinking(" Step 2: Consider...").await;

        // Check current state
        let current = state.get_current_thinking().await;
        assert!(current.is_some());
        let content = current.unwrap();
        assert_eq!(content.thinking, "Step 1: Analyze... Step 2: Consider...");

        // Complete thinking
        let final_content = state.complete_thinking().await;
        assert!(final_content.is_some());
        let final_content = final_content.unwrap();
        assert!(final_content.completed_at.is_some());

        // Should be cleared now
        assert!(state.get_current_thinking().await.is_none());
    }
}
