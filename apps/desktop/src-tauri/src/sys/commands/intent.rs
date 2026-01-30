//! Tauri commands for intent detection and tool routing.
//!
//! This module exposes the intent detection system to the frontend, enabling
//! early intent classification and tool routing for improved user experience.

use crate::core::intent::{
    Complexity, DetectedIntent, IntentCategory, IntentDetector, IntentDetectorConfig,
    OptimizationResult, QuickWinOptimizer, RequiredServer, RoutingPlan, ToolRouter, ToolSelection,
};
use crate::sys::commands::McpState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// State for the intent detection system.
pub struct IntentState {
    detector: Arc<RwLock<IntentDetector>>,
}

impl IntentState {
    /// Creates a new intent state with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            detector: Arc::new(RwLock::new(IntentDetector::new())),
        }
    }

    /// Creates a new intent state with custom configuration.
    #[must_use]
    pub fn with_config(config: IntentDetectorConfig) -> Self {
        Self {
            detector: Arc::new(RwLock::new(IntentDetector::with_config(config))),
        }
    }
}

impl Default for IntentState {
    fn default() -> Self {
        Self::new()
    }
}

/// Serializable version of DetectedIntent for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedIntentResponse {
    /// The original user prompt.
    pub prompt: String,
    /// Primary intent category as string.
    pub primary_category: String,
    /// Secondary intent categories.
    pub secondary_categories: Vec<String>,
    /// Complexity level.
    pub complexity: String,
    /// Overall confidence score (0.0 to 1.0).
    pub confidence: f64,
    /// Category confidence.
    pub category_confidence: f64,
    /// Tool confidence.
    pub tool_confidence: f64,
    /// Required tools for this intent.
    pub required_tools: Vec<String>,
    /// Required MCP servers.
    pub required_servers: Vec<RequiredServerResponse>,
    /// Extracted entities from the prompt.
    pub entities: HashMap<String, String>,
    /// Whether this is a quick-win task.
    pub is_quick_win: bool,
    /// Suggested action description.
    pub suggested_action: String,
    /// Keywords that triggered this intent.
    pub matched_keywords: Vec<String>,
    /// Whether the intent requires network access.
    pub requires_network: bool,
}

/// Serializable version of RequiredServer for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredServerResponse {
    /// Name of the MCP server.
    pub name: String,
    /// Whether this server is required or optional.
    pub required: bool,
    /// Priority for starting this server (lower = higher priority).
    pub priority: u8,
    /// Specific tools needed from this server.
    pub tools: Vec<String>,
}

impl From<&RequiredServer> for RequiredServerResponse {
    fn from(server: &RequiredServer) -> Self {
        Self {
            name: server.name.clone(),
            required: server.required,
            priority: server.priority,
            tools: server.tools.clone(),
        }
    }
}

impl From<&DetectedIntent> for DetectedIntentResponse {
    fn from(intent: &DetectedIntent) -> Self {
        Self {
            prompt: intent.prompt.clone(),
            primary_category: format!("{:?}", intent.primary_category).to_lowercase(),
            secondary_categories: intent
                .secondary_categories
                .iter()
                .map(|c| format!("{:?}", c).to_lowercase())
                .collect(),
            complexity: format!("{:?}", intent.complexity).to_lowercase(),
            confidence: intent.confidence.score,
            category_confidence: intent.confidence.category_confidence,
            tool_confidence: intent.confidence.tool_confidence,
            required_tools: intent.required_tools.clone(),
            required_servers: intent.required_servers.iter().map(|s| s.into()).collect(),
            entities: intent.entities.clone(),
            is_quick_win: intent.is_quick_win,
            suggested_action: intent.suggested_action.clone(),
            matched_keywords: intent.matched_keywords.clone(),
            requires_network: intent.requires_network(),
        }
    }
}

/// Serializable version of ToolSelection for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSelectionResponse {
    /// Tool ID.
    pub tool_id: String,
    /// Why this tool was selected.
    pub reason: String,
    /// Confidence in this selection (0.0 to 1.0).
    pub confidence: f64,
    /// Estimated execution time in milliseconds.
    pub estimated_time_ms: u64,
    /// Whether this tool is from an MCP server.
    pub is_mcp_tool: bool,
    /// The MCP server name if applicable.
    pub server_name: Option<String>,
    /// Priority for execution (lower = higher priority).
    pub priority: u8,
    /// Dependencies on other tools.
    pub dependencies: Vec<String>,
}

impl From<&ToolSelection> for ToolSelectionResponse {
    fn from(selection: &ToolSelection) -> Self {
        Self {
            tool_id: selection.tool_id.clone(),
            reason: selection.reason.clone(),
            confidence: selection.confidence,
            estimated_time_ms: selection.estimated_time.as_millis() as u64,
            is_mcp_tool: selection.is_mcp_tool,
            server_name: selection.server_name.clone(),
            priority: selection.priority,
            dependencies: selection.dependencies.clone(),
        }
    }
}

/// Serializable version of RoutingPlan for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingPlanResponse {
    /// The detected intent.
    pub intent: DetectedIntentResponse,
    /// Selected tools in execution order.
    pub tools: Vec<ToolSelectionResponse>,
    /// MCP servers that need to be started.
    pub servers_to_start: Vec<RequiredServerResponse>,
    /// MCP servers that are already running.
    pub servers_running: Vec<String>,
    /// Estimated total execution time in milliseconds.
    pub estimated_time_ms: u64,
    /// Whether this plan can skip the planning phase.
    pub skip_planning: bool,
    /// Whether this is a quick-win optimized plan.
    pub is_optimized: bool,
    /// Optimization strategies applied.
    pub optimization_strategies: Vec<String>,
    /// Parallel execution groups.
    pub parallel_groups: Vec<Vec<String>>,
    /// Direct answer if available.
    pub direct_answer: Option<String>,
}

impl From<&RoutingPlan> for RoutingPlanResponse {
    fn from(plan: &RoutingPlan) -> Self {
        Self {
            intent: (&plan.intent).into(),
            tools: plan.tools.iter().map(|t| t.into()).collect(),
            servers_to_start: plan.servers_to_start.iter().map(|s| s.into()).collect(),
            servers_running: plan.servers_running.clone(),
            estimated_time_ms: plan.estimated_time.as_millis() as u64,
            skip_planning: plan.skip_planning,
            is_optimized: plan.is_optimized,
            optimization_strategies: plan.optimization_strategies.clone(),
            parallel_groups: plan.parallel_groups.clone(),
            direct_answer: plan.direct_answer.clone(),
        }
    }
}

/// Serializable version of OptimizationResult for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationResultResponse {
    /// Whether this is a quick-win task.
    pub is_quick_win: bool,
    /// Optimized tool selection.
    pub optimized_tools: Vec<ToolSelectionResponse>,
    /// Optimized complexity level.
    pub optimized_complexity: String,
    /// Estimated execution time in milliseconds.
    pub estimated_time_ms: u64,
    /// Optimization strategies applied.
    pub strategies_applied: Vec<String>,
    /// Whether to skip planning phase.
    pub skip_planning: bool,
    /// Direct answer if available.
    pub direct_answer: Option<String>,
}

impl From<&OptimizationResult> for OptimizationResultResponse {
    fn from(result: &OptimizationResult) -> Self {
        Self {
            is_quick_win: result.is_quick_win,
            optimized_tools: result.optimized_tools.iter().map(|t| t.into()).collect(),
            optimized_complexity: format!("{:?}", result.optimized_complexity).to_lowercase(),
            estimated_time_ms: result.estimated_time.as_millis() as u64,
            strategies_applied: result.strategies_applied.clone(),
            skip_planning: result.skip_planning,
            direct_answer: result.direct_answer.clone(),
        }
    }
}

/// List of all intent categories with descriptions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentCategoryInfo {
    /// Category identifier.
    pub id: String,
    /// Human-readable description.
    pub description: String,
}

/// Detect intent from a user prompt using pattern matching (synchronous).
///
/// This is a fast, local detection that does not require LLM calls.
/// Use this for immediate feedback while typing.
#[tauri::command]
pub async fn intent_detect(
    state: State<'_, IntentState>,
    prompt: String,
) -> Result<DetectedIntentResponse, String> {
    let detector = state.detector.read().await;
    detector
        .detect_sync(&prompt)
        .map(|intent| (&intent).into())
        .map_err(|e| e.to_string())
}

/// Detect intent from a user prompt with optional LLM fallback.
///
/// This may use LLM for ambiguous prompts if configured.
/// Use this for final intent classification before execution.
#[tauri::command]
pub async fn intent_detect_with_llm(
    state: State<'_, IntentState>,
    prompt: String,
) -> Result<DetectedIntentResponse, String> {
    let detector = state.detector.read().await;
    detector
        .detect(&prompt)
        .await
        .map(|intent| (&intent).into())
        .map_err(|e| e.to_string())
}

/// Create a routing plan for a detected intent.
///
/// This determines which tools and MCP servers are needed.
#[tauri::command]
pub async fn intent_create_routing_plan(
    state: State<'_, IntentState>,
    mcp_state: State<'_, McpState>,
    prompt: String,
) -> Result<RoutingPlanResponse, String> {
    // First detect the intent
    let detector = state.detector.read().await;
    let intent = detector.detect_sync(&prompt).map_err(|e| e.to_string())?;

    // Create router with MCP client
    let mcp_client = mcp_state.client.clone();
    let router = ToolRouter::new(mcp_client);

    // Create routing plan
    router
        .route_sync(&intent)
        .map(|plan| (&plan).into())
        .map_err(|e| e.to_string())
}

/// Check if a prompt is a quick-win task that can be optimized.
#[tauri::command]
pub async fn intent_check_quick_win(
    state: State<'_, IntentState>,
    prompt: String,
) -> Result<OptimizationResultResponse, String> {
    let detector = state.detector.read().await;
    let intent = detector.detect_sync(&prompt).map_err(|e| e.to_string())?;

    let optimizer = QuickWinOptimizer::new();
    optimizer
        .optimize(&intent)
        .map(|result| (&result).into())
        .map_err(|e| e.to_string())
}

/// Get all available intent categories with descriptions.
#[tauri::command]
pub fn intent_get_categories() -> Vec<IntentCategoryInfo> {
    IntentCategory::all()
        .into_iter()
        .map(|category| IntentCategoryInfo {
            id: format!("{:?}", category).to_lowercase(),
            description: category.description().to_string(),
        })
        .collect()
}

/// Extract entities from a prompt (file paths, URLs, emails, etc.).
#[tauri::command]
pub async fn intent_extract_entities(
    state: State<'_, IntentState>,
    prompt: String,
) -> Result<HashMap<String, String>, String> {
    let detector = state.detector.read().await;
    let entities = detector.pattern_matcher().extract_entities(&prompt);
    Ok(entities)
}

/// Get complexity information for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplexityInfo {
    /// Complexity level identifier.
    pub id: String,
    /// Minimum estimated duration in seconds.
    pub min_duration_secs: u64,
    /// Maximum estimated duration in seconds.
    pub max_duration_secs: u64,
    /// Maximum number of steps.
    pub max_steps: usize,
}

/// Get all complexity levels with their characteristics.
#[tauri::command]
pub fn intent_get_complexity_levels() -> Vec<ComplexityInfo> {
    vec![
        Complexity::QuickWin,
        Complexity::Simple,
        Complexity::Moderate,
        Complexity::Complex,
        Complexity::LongRunning,
    ]
    .into_iter()
    .map(|complexity| {
        let (min, max) = complexity.estimated_duration();
        ComplexityInfo {
            id: format!("{:?}", complexity).to_lowercase(),
            min_duration_secs: min.as_secs(),
            max_duration_secs: max.as_secs(),
            max_steps: complexity.max_steps(),
        }
    })
    .collect()
}

/// Batch detect intents for multiple prompts.
#[tauri::command]
pub async fn intent_detect_batch(
    state: State<'_, IntentState>,
    prompts: Vec<String>,
) -> Result<Vec<DetectedIntentResponse>, String> {
    let detector = state.detector.read().await;
    let results: Vec<_> = prompts
        .iter()
        .map(|prompt| {
            detector
                .detect_sync(prompt)
                .map(|intent| (&intent).into())
                .unwrap_or_else(|_| DetectedIntentResponse {
                    prompt: prompt.clone(),
                    primary_category: "conversation".to_string(),
                    secondary_categories: Vec::new(),
                    complexity: "simple".to_string(),
                    confidence: 0.0,
                    category_confidence: 0.0,
                    tool_confidence: 0.0,
                    required_tools: Vec::new(),
                    required_servers: Vec::new(),
                    entities: HashMap::new(),
                    is_quick_win: false,
                    suggested_action: "Continue the conversation".to_string(),
                    matched_keywords: Vec::new(),
                    requires_network: false,
                })
        })
        .collect();
    Ok(results)
}

/// Configure the intent detector.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentDetectorConfigRequest {
    /// Minimum confidence threshold for pattern-based detection.
    pub min_pattern_confidence: Option<f64>,
    /// Whether to use LLM for ambiguous intents.
    pub use_llm_fallback: Option<bool>,
    /// LLM confidence threshold for accepting LLM-based detection.
    pub llm_confidence_threshold: Option<f64>,
    /// Maximum number of secondary categories to include.
    pub max_secondary_categories: Option<usize>,
}

/// Update the intent detector configuration.
#[tauri::command]
pub async fn intent_configure(
    state: State<'_, IntentState>,
    config: IntentDetectorConfigRequest,
) -> Result<(), String> {
    let mut detector = state.detector.write().await;
    let new_config = IntentDetectorConfig {
        min_pattern_confidence: config.min_pattern_confidence.unwrap_or(0.4),
        use_llm_fallback: config.use_llm_fallback.unwrap_or(true),
        llm_confidence_threshold: config.llm_confidence_threshold.unwrap_or(0.7),
        max_secondary_categories: config.max_secondary_categories.unwrap_or(3),
    };
    *detector = IntentDetector::with_config(new_config);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_intent_category_info() {
        let categories = intent_get_categories();
        assert!(!categories.is_empty());
        assert!(categories.iter().any(|c| c.id == "fileoperation"));
        assert!(categories.iter().any(|c| c.id == "websearch"));
    }

    #[test]
    fn test_complexity_levels() {
        let levels = intent_get_complexity_levels();
        assert_eq!(levels.len(), 5);
        assert!(levels.iter().any(|l| l.id == "quickwin"));
        assert!(levels.iter().any(|l| l.id == "longrunning"));
    }
}
