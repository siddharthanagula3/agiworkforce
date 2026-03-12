//! Tauri commands for the Research Mode feature.
//!
//! These commands expose the research orchestration system to the frontend,
//! allowing users to initiate research queries via chat (e.g., "research topic X").
//!
//! ## Events Emitted
//!
//! - `research:progress` - Progress updates during research
//! - `research:completed` - Research completed successfully
//! - `research:error` - Research failed with error

use crate::core::research::{
    ResearchConfig, ResearchError, ResearchMode, ResearchOrchestrator, ResearchResult,
};
use crate::sys::commands::llm::LLMState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

/// State wrapper for the research orchestrator.
pub struct ResearchState {
    /// Configuration for research operations
    pub config: RwLock<ResearchConfig>,
    /// Active research sessions that can be cancelled
    pub active_sessions: RwLock<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
}

impl ResearchState {
    /// Creates a new research state with default configuration.
    pub fn new() -> Self {
        Self {
            config: RwLock::new(ResearchConfig::default()),
            active_sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Creates a new research state with custom configuration.
    pub fn with_config(config: ResearchConfig) -> Self {
        Self {
            config: RwLock::new(config),
            active_sessions: RwLock::new(HashMap::new()),
        }
    }
}

impl Default for ResearchState {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to start a research operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchRequest {
    /// The research query from the user
    pub query: String,
    /// Research mode (quick, standard, deep, exhaustive)
    #[serde(default)]
    pub mode: ResearchModeInput,
    /// Optional configuration overrides
    #[serde(default)]
    pub config_overrides: Option<ResearchConfigOverrides>,
    /// Optional task ID for frontend correlation
    #[serde(default, alias = "taskId")]
    pub task_id: Option<String>,
}

/// Input type for research mode to handle string conversion.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchModeInput {
    Quick,
    #[default]
    Standard,
    Deep,
    Exhaustive,
}

impl From<ResearchModeInput> for ResearchMode {
    fn from(input: ResearchModeInput) -> Self {
        match input {
            ResearchModeInput::Quick => ResearchMode::Quick,
            ResearchModeInput::Standard => ResearchMode::Standard,
            ResearchModeInput::Deep => ResearchMode::Deep,
            ResearchModeInput::Exhaustive => ResearchMode::Exhaustive,
        }
    }
}

/// Configuration overrides for a single research operation.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResearchConfigOverrides {
    pub enable_web_search: Option<bool>,
    pub enable_document_search: Option<bool>,
    pub enable_email_search: Option<bool>,
    pub enable_calendar_search: Option<bool>,
    pub enable_memory_search: Option<bool>,
    pub min_confidence_threshold: Option<f32>,
    pub show_confidence_indicators: Option<bool>,
}

/// Serializable research result for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResearchResponse {
    pub session_id: String,
    pub query: String,
    pub mode: String,
    pub report: String,
    pub summary: String,
    pub key_findings: Vec<String>,
    pub citations_count: usize,
    pub confidence: String,
    pub duration_secs: u64,
    pub sources_examined: usize,
    pub sources_cited: usize,
}

impl From<ResearchResult> for ResearchResponse {
    fn from(result: ResearchResult) -> Self {
        Self {
            session_id: result.session_id,
            query: result.query,
            mode: format!("{:?}", result.mode).to_lowercase(),
            report: result.report,
            summary: result.summary,
            key_findings: result.key_findings,
            citations_count: result.citations.len(),
            confidence: format!("{:?}", result.confidence).to_lowercase(),
            duration_secs: result.metadata.duration_secs,
            sources_examined: result.metadata.sources_examined,
            sources_cited: result.metadata.sources_cited,
        }
    }
}

/// Translates research errors to user-friendly messages.
fn translate_research_error(error: &ResearchError) -> String {
    match error {
        ResearchError::InvalidQuery => "Please provide a research topic or question.".to_string(),
        ResearchError::NoAgentsAvailable => {
            "No research sources are available. Please check your configuration.".to_string()
        }
        ResearchError::Timeout(duration) => {
            format!(
                "Research took too long ({}s). Try a simpler query or use Quick mode.",
                duration.as_secs()
            )
        }
        ResearchError::AllAgentsFailed(details) => {
            tracing::warn!("All research agents failed: {}", details);
            "Could not gather information from any sources. Please try again later.".to_string()
        }
        ResearchError::LlmError(details) => {
            tracing::error!("LLM error during research: {}", details);
            "Could not process the research findings. Please try again.".to_string()
        }
        ResearchError::CitationError(details) => {
            tracing::warn!("Citation error: {}", details);
            "Had trouble organizing the sources. The report may be incomplete.".to_string()
        }
        ResearchError::ReportError(details) => {
            tracing::warn!("Report generation error: {}", details);
            "Could not generate the research report. Please try again.".to_string()
        }
        ResearchError::AgentError { agent, message } => {
            tracing::warn!("Agent {} failed: {}", agent, message);
            format!(
                "One of the search sources ({}) had an issue. Results may be incomplete.",
                match agent.as_str() {
                    "web_search" => "web search",
                    "document_search" => "document search",
                    "email_search" => "email",
                    "calendar_search" => "calendar",
                    "memory_search" => "memory",
                    _ => &agent,
                }
            )
        }
        ResearchError::ConfigError(details) => {
            tracing::error!("Research config error: {}", details);
            "Research is not properly configured. Please check your settings.".to_string()
        }
        ResearchError::Internal(details) => {
            tracing::error!("Internal research error: {}", details);
            "Something went wrong during research. Please try again.".to_string()
        }
    }
}

/// Starts a research operation.
///
/// This command initiates a multi-source research investigation based on the user's query.
/// Progress updates are emitted via the `research:progress` event, and the final result
/// is returned when complete.
///
/// # Arguments
///
/// * `query` - The research query from the user
/// * `mode` - Research mode: "quick", "standard", "deep", or "exhaustive"
///
/// # Example (Frontend)
///
/// ```typescript
/// const result = await invoke('research_start', {
///   request: {
///     query: "What are the latest trends in AI?",
///     mode: "standard"
///   }
/// });
/// ```
#[tauri::command]
pub async fn research_start(
    app: AppHandle,
    state: State<'_, ResearchState>,
    llm_state: State<'_, LLMState>,
    request: ResearchRequest,
) -> Result<ResearchResponse, String> {
    // Validate query
    let query = request.query.trim();
    if query.is_empty() {
        return Err("Please provide a research topic or question.".to_string());
    }

    // Get configuration
    let base_config = state.config.read().await.clone();
    let config = if let Some(overrides) = request.config_overrides {
        ResearchConfig {
            enable_web_search: overrides
                .enable_web_search
                .unwrap_or(base_config.enable_web_search),
            enable_document_search: overrides
                .enable_document_search
                .unwrap_or(base_config.enable_document_search),
            enable_email_search: overrides
                .enable_email_search
                .unwrap_or(base_config.enable_email_search),
            enable_calendar_search: overrides
                .enable_calendar_search
                .unwrap_or(base_config.enable_calendar_search),
            enable_memory_search: overrides
                .enable_memory_search
                .unwrap_or(base_config.enable_memory_search),
            min_confidence_threshold: overrides
                .min_confidence_threshold
                .unwrap_or(base_config.min_confidence_threshold),
            show_confidence_indicators: overrides
                .show_confidence_indicators
                .unwrap_or(base_config.show_confidence_indicators),
            ..base_config
        }
    } else {
        base_config
    };

    // Use shared LLM router so provider configuration is respected
    let router = llm_state.router.clone();

    // Create orchestrator with app handle for events
    let orchestrator = match ResearchOrchestrator::new(router, config) {
        Ok(o) => o
            .with_app_handle(app.clone())
            .with_task_id(request.task_id.clone()),
        Err(e) => return Err(translate_research_error(&e)),
    };

    // Convert mode
    let mode: ResearchMode = request.mode.into();

    tracing::info!("Starting research: query='{}', mode={:?}", query, mode);

    // Execute research
    match orchestrator.research(query, mode).await {
        Ok(result) => {
            tracing::info!(
                "Research completed: session={}, sources={}, duration={}s",
                result.session_id,
                result.metadata.sources_cited,
                result.metadata.duration_secs
            );

            if let Some(task_id) = request.task_id.clone() {
                for finding in &result.key_findings {
                    let _ = app.emit(
                        "research:finding_added",
                        serde_json::json!({
                            "task_id": task_id,
                            "finding": finding,
                        }),
                    );
                }

                for citation in &result.citations {
                    let domain = citation
                        .url
                        .as_deref()
                        .and_then(|url| url::Url::parse(url).ok())
                        .and_then(|parsed| parsed.domain().map(|d| d.to_string()));

                    let _ = app.emit(
                        "research:source_added",
                        serde_json::json!({
                            "task_id": task_id,
                            "source": {
                                "title": citation.title.clone(),
                                "url": citation.url.clone().unwrap_or_default(),
                                "domain": domain
                            }
                        }),
                    );
                }
            }

            Ok(result.into())
        }
        Err(e) => {
            let error_msg = translate_research_error(&e);
            // Emit error event
            let _ = app.emit(
                "research:error",
                serde_json::json!({
                    "task_id": request.task_id,
                    "query": query,
                    "error": error_msg.clone(),
                }),
            );
            Err(error_msg)
        }
    }
}

/// Cancels an ongoing research operation.
///
/// # Arguments
///
/// * `session_id` - The ID of the research session to cancel
#[tauri::command]
pub async fn research_cancel(
    state: State<'_, ResearchState>,
    session_id: String,
) -> Result<bool, String> {
    let sessions = state.active_sessions.read().await;
    if let Some(cancelled) = sessions.get(&session_id) {
        cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        tracing::info!("Research session {} cancelled", session_id);
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Gets the current research configuration.
#[tauri::command]
pub async fn research_get_config(
    state: State<'_, ResearchState>,
) -> Result<ResearchConfig, String> {
    Ok(state.config.read().await.clone())
}

/// Updates the research configuration.
#[tauri::command]
pub async fn research_set_config(
    state: State<'_, ResearchState>,
    config: ResearchConfig,
) -> Result<(), String> {
    *state.config.write().await = config;
    tracing::info!("Research configuration updated");
    Ok(())
}

/// Gets available research modes with descriptions.
#[tauri::command]
pub fn research_get_modes() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "id": "quick",
            "name": "Quick",
            "description": "Fast search (30s - 2min), single iteration, top results only",
            "estimated_time": "30 seconds - 2 minutes"
        }),
        serde_json::json!({
            "id": "standard",
            "name": "Standard",
            "description": "Balanced research (2-10min), multiple iterations, moderate depth",
            "estimated_time": "2 - 10 minutes"
        }),
        serde_json::json!({
            "id": "deep",
            "name": "Deep",
            "description": "Comprehensive investigation (5-30min), multiple angles explored",
            "estimated_time": "5 - 30 minutes"
        }),
        serde_json::json!({
            "id": "exhaustive",
            "name": "Exhaustive",
            "description": "Maximum depth research (15-60min), all available sources",
            "estimated_time": "15 - 60 minutes"
        }),
    ]
}

/// Quick research command for simple queries.
///
/// This is a convenience command that runs a quick research operation
/// with default settings. Useful for simple fact-checking or quick lookups.
#[tauri::command]
pub async fn research_quick(
    app: AppHandle,
    state: State<'_, ResearchState>,
    llm_state: State<'_, LLMState>,
    query: String,
) -> Result<ResearchResponse, String> {
    research_start(
        app,
        state,
        llm_state,
        ResearchRequest {
            query,
            mode: ResearchModeInput::Quick,
            config_overrides: None,
            task_id: None,
        },
    )
    .await
}

/// Checks if research capabilities are available.
///
/// Returns information about which research sources are configured and available.
#[tauri::command]
pub async fn research_check_availability(
    state: State<'_, ResearchState>,
) -> Result<serde_json::Value, String> {
    let config = state.config.read().await;

    Ok(serde_json::json!({
        "available": true,
        "sources": {
            "web_search": {
                "enabled": config.enable_web_search,
                "status": if config.enable_web_search { "ready" } else { "disabled" }
            },
            "document_search": {
                "enabled": config.enable_document_search,
                "status": if config.enable_document_search { "ready" } else { "disabled" }
            },
            "email_search": {
                "enabled": config.enable_email_search,
                "status": if config.enable_email_search { "requires_connection" } else { "disabled" }
            },
            "calendar_search": {
                "enabled": config.enable_calendar_search,
                "status": if config.enable_calendar_search { "requires_connection" } else { "disabled" }
            },
            "memory_search": {
                "enabled": config.enable_memory_search,
                "status": if config.enable_memory_search { "ready" } else { "disabled" }
            }
        },
        "default_mode": "standard"
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_research_mode_conversion() {
        assert!(matches!(
            ResearchMode::from(ResearchModeInput::Quick),
            ResearchMode::Quick
        ));
        assert!(matches!(
            ResearchMode::from(ResearchModeInput::Standard),
            ResearchMode::Standard
        ));
        assert!(matches!(
            ResearchMode::from(ResearchModeInput::Deep),
            ResearchMode::Deep
        ));
        assert!(matches!(
            ResearchMode::from(ResearchModeInput::Exhaustive),
            ResearchMode::Exhaustive
        ));
    }

    #[test]
    fn test_error_translation() {
        let error = ResearchError::InvalidQuery;
        let message = translate_research_error(&error);
        assert!(message.contains("research topic"));

        let error = ResearchError::Timeout(std::time::Duration::from_secs(60));
        let message = translate_research_error(&error);
        assert!(message.contains("too long"));
    }

    #[test]
    fn test_research_state_default() {
        let state = ResearchState::default();
        // The config should have default values
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let config = state.config.read().await;
            assert!(config.enable_web_search);
            assert!(config.enable_memory_search);
        });
    }
}
