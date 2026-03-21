//! Observe-Plan-Act Loop for Computer Use.
//!
//! This module implements the core autonomous loop that:
//! 1. Observes the current screen state
//! 2. Plans the next action(s) using vision LLM
//! 3. Acts by executing the planned actions
//! 4. Verifies progress and repeats until task is complete

use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout};

use crate::automation::input::{
    KeyboardSimulator, MouseButton as InputMouseButton, MouseSimulator,
};
use crate::automation::screen::{capture_primary_screen, list_displays, ScreenInfo};
use crate::core::llm::llm_router::LLMRouter;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest,
};

use super::safety::{ComputerUseSafetyLayer, SafetyConfig};
use super::session::{ComputerUseSession, SessionConfig};
use super::types::{
    ComputerUseAction, ComputerUseTask, Coordinate, ElementBounds, HotkeyModifier, MouseButton,
    ScrollDirection, TaskOutcome, TaskProgress, WaitCondition,
};
use super::visual_reasoner::{VisualReasoner, VisualReasonerConfig};
use super::window_manager::{WindowCoordinator, WindowManagerConfig};

/// Configuration for the Computer Use agent.
#[derive(Debug, Clone)]
pub struct ComputerUseConfig {
    /// Maximum iterations of the OPA loop.
    pub max_iterations: u32,
    /// Maximum total time for task execution.
    pub max_duration: Duration,
    /// Delay between actions.
    pub action_delay: Duration,
    /// Delay between OPA iterations.
    pub iteration_delay: Duration,
    /// Consecutive failures before abandoning task.
    pub max_consecutive_failures: u32,
    /// Timeout for LLM planning calls.
    pub planning_timeout: Duration,
    /// Whether to verify progress after each action.
    pub verify_after_action: bool,
    /// Verification interval (check every N actions).
    pub verification_interval: u32,
    /// Safety configuration.
    pub safety: SafetyConfig,
    /// Visual reasoner configuration.
    pub visual: VisualReasonerConfig,
    /// Session configuration.
    pub session: SessionConfig,
    /// Window manager configuration.
    pub window: WindowManagerConfig,
}

impl Default for ComputerUseConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            max_duration: Duration::from_secs(300), // 5 minutes
            action_delay: Duration::from_millis(100),
            iteration_delay: Duration::from_millis(500),
            max_consecutive_failures: 3,
            planning_timeout: Duration::from_secs(30),
            verify_after_action: true,
            verification_interval: 5, // Verify every 5 actions
            safety: SafetyConfig::default(),
            visual: VisualReasonerConfig::default(),
            session: SessionConfig::default(),
            window: WindowManagerConfig::default(),
        }
    }
}

/// Current state of the OPA loop execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionState {
    /// Current iteration number.
    pub iteration: u32,
    /// Total actions executed.
    pub actions_executed: u32,
    /// Consecutive failures.
    pub consecutive_failures: u32,
    /// Time elapsed.
    pub elapsed_ms: u64,
    /// Last action description.
    pub last_action: Option<String>,
    /// Current screen understanding.
    pub screen_state: Option<String>,
    /// Whether making progress.
    pub making_progress: bool,
    /// Task complete flag.
    pub task_complete: bool,
}

impl Default for ExecutionState {
    fn default() -> Self {
        Self {
            iteration: 0,
            actions_executed: 0,
            consecutive_failures: 0,
            elapsed_ms: 0,
            last_action: None,
            screen_state: None,
            making_progress: true,
            task_complete: false,
        }
    }
}

/// Result of an OPA loop iteration.
#[derive(Debug, Clone)]
pub struct OpaLoopResult {
    /// Whether the task completed successfully.
    pub success: bool,
    /// Reason for completion (success, failure, or timeout).
    pub reason: CompletionReason,
    /// Final execution state.
    pub state: ExecutionState,
    /// Task outcome.
    pub outcome: TaskOutcome,
}

/// Reason why the OPA loop completed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CompletionReason {
    TaskComplete,
    MaxIterationsReached,
    Timeout,
    TooManyFailures { failures: u32 },
    UserCancelled,
    SafetyBlocked { reason: String },
    NotMakingProgress,
}

/// The Computer Use Agent that drives autonomous task execution.
pub struct ComputerUseAgent {
    llm_router: Arc<RwLock<LLMRouter>>,
    config: ComputerUseConfig,
    visual_reasoner: VisualReasoner,
    safety_layer: ComputerUseSafetyLayer,
    window_coordinator: WindowCoordinator,
    app_handle: Option<AppHandle>,
}

impl ComputerUseAgent {
    /// Creates a new Computer Use agent.
    pub fn new(llm_router: Arc<RwLock<LLMRouter>>, config: ComputerUseConfig) -> Result<Self> {
        let visual_reasoner = VisualReasoner::new(Arc::clone(&llm_router), config.visual.clone());
        let safety_layer = ComputerUseSafetyLayer::new(config.safety.clone());
        let window_coordinator = WindowCoordinator::new(config.window.clone());

        Ok(Self {
            llm_router,
            config,
            visual_reasoner,
            safety_layer,
            window_coordinator,
            app_handle: None,
        })
    }

    /// Creates an agent with default configuration.
    pub fn with_defaults(llm_router: Arc<RwLock<LLMRouter>>) -> Result<Self> {
        Self::new(llm_router, ComputerUseConfig::default())
    }

    /// Sets the app handle for event emission.
    pub fn with_app_handle(mut self, app_handle: AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Executes a task using the Observe-Plan-Act loop.
    pub async fn execute_task(&self, task: ComputerUseTask) -> Result<OpaLoopResult> {
        let start = Instant::now();
        let mut state = ExecutionState::default();
        let mut session = ComputerUseSession::new(task.clone(), self.config.session.clone());

        if let Some(ref app) = self.app_handle {
            session = session.with_app_handle(app.clone());
        }

        session.start();

        // Focus target application if specified
        if let Some(ref app_name) = task.target_application {
            let activation = self.window_coordinator.activate_by_title(app_name).await;
            if !activation.success {
                tracing::warn!(
                    "Could not activate target application: {:?}",
                    activation.error
                );
            }
        }

        // Main OPA loop
        loop {
            state.iteration += 1;
            state.elapsed_ms = start.elapsed().as_millis() as u64;

            // Check termination conditions
            if state.iteration > self.config.max_iterations {
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::MaxIterationsReached,
                );
            }

            if start.elapsed() > self.config.max_duration {
                return self.complete_task(&mut session, state, CompletionReason::Timeout);
            }

            if state.consecutive_failures >= self.config.max_consecutive_failures {
                let failures = state.consecutive_failures;
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::TooManyFailures { failures },
                );
            }

            if session.is_cancelled() {
                return self.complete_task(&mut session, state, CompletionReason::UserCancelled);
            }

            // OBSERVE: Capture and analyze screen
            let observation = match self.visual_reasoner.observe_screen().await {
                Ok(obs) => obs,
                Err(e) => {
                    tracing::error!("Failed to observe screen: {}", e);
                    state.consecutive_failures += 1;
                    sleep(self.config.iteration_delay).await;
                    continue;
                }
            };

            // Check for prompt injection in screen content
            if let Some(reason) = self.safety_layer.scan_for_injection(&observation.analysis) {
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::SafetyBlocked {
                        reason: serde_json::to_string(&reason)
                            .unwrap_or_else(|_| format!("{reason:?}")),
                    },
                );
            }

            state.screen_state = Some(observation.analysis.screen_description.clone());

            // PLAN: Determine next actions
            let plan = match self.plan_next_actions(&task, &observation, &state).await {
                Ok(plan) => plan,
                Err(e) => {
                    tracing::error!("Planning failed: {}", e);
                    state.consecutive_failures += 1;
                    sleep(self.config.iteration_delay).await;
                    continue;
                }
            };

            // Check if task is complete
            if plan.task_complete {
                state.task_complete = true;
                return self.complete_task(&mut session, state, CompletionReason::TaskComplete);
            }

            // Check if making progress
            if !plan.making_progress {
                state.making_progress = false;
                if state.consecutive_failures >= 2 {
                    return self.complete_task(
                        &mut session,
                        state,
                        CompletionReason::NotMakingProgress,
                    );
                }
            } else {
                state.making_progress = true;
            }

            // ACT: Execute planned actions
            for action in plan.actions {
                // Safety check
                let decision = self.safety_layer.evaluate_action(&action);

                if !decision.allowed {
                    if let Some(reason) = decision.reason {
                        tracing::warn!("Action blocked by safety: {:?}", reason);
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked {
                                reason: serde_json::to_string(&reason)
                                    .unwrap_or_else(|_| format!("{reason:?}")),
                            },
                        );
                    }
                    continue;
                }

                // Handle confirmation requirement
                if decision.requires_confirmation && task.require_confirmation {
                    session.pause(decision.warnings.join(", "), action.clone());

                    // Wait for resume (in real implementation, this would be async)
                    while session.is_paused() && !session.is_cancelled() {
                        sleep(Duration::from_millis(100)).await;
                    }

                    if session.is_cancelled() {
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::UserCancelled,
                        );
                    }
                }

                // Capture before screenshot
                let before = session.capture_before(&action)?;

                // Execute the action
                let action_start = Instant::now();
                let result = self.execute_action(&action).await;
                let duration_ms = action_start.elapsed().as_millis() as u64;

                // Record the action
                let (success, error) = match &result {
                    Ok(()) => (true, None),
                    Err(e) => (false, Some(e.to_string())),
                };

                session.record_action(
                    action.clone(),
                    before,
                    success,
                    error.clone(),
                    duration_ms,
                )?;

                state.last_action = Some(action.description());

                if success {
                    state.actions_executed += 1;
                    state.consecutive_failures = 0;
                } else {
                    state.consecutive_failures += 1;
                    tracing::warn!("Action failed: {:?}", error);
                }

                // Delay between actions
                sleep(self.config.action_delay).await;
            }

            // Update progress
            session.update_progress(TaskProgress {
                actions_completed: state.actions_executed,
                current_step: state.last_action.clone().unwrap_or_default(),
                estimated_percent: ((state.iteration as f32 / self.config.max_iterations as f32)
                    * 100.0) as u8,
                elapsed_ms: state.elapsed_ms,
                making_progress: state.making_progress,
                warnings: Vec::new(),
            });

            // Iteration delay
            sleep(self.config.iteration_delay).await;
        }
    }

    /// Plans the next actions based on current screen state.
    async fn plan_next_actions(
        &self,
        task: &ComputerUseTask,
        observation: &super::visual_reasoner::ScreenObservation,
        state: &ExecutionState,
    ) -> Result<ActionPlan> {
        let prompt = self.create_planning_prompt(task, observation, state);

        let response = self
            .call_vision_llm(&prompt, &observation.image_base64)
            .await
            .context("Planning LLM call failed")?;

        self.parse_action_plan(&response)
    }

    /// Creates the planning prompt for the LLM.
    fn create_planning_prompt(
        &self,
        task: &ComputerUseTask,
        observation: &super::visual_reasoner::ScreenObservation,
        state: &ExecutionState,
    ) -> String {
        let history = if let Some(ref action) = state.last_action {
            format!(
                "Last action: {}\nActions completed: {}",
                action, state.actions_executed
            )
        } else {
            "No actions taken yet.".to_string()
        };

        let success_indicators = if !task.success_indicators.is_empty() {
            format!(
                "\n\nSuccess indicators (task is complete when you see any of these):\n{}",
                task.success_indicators
                    .iter()
                    .map(|s| format!("- {}", s))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        } else {
            String::new()
        };

        format!(
            r#"You are AGI Workforce's automation engine, controlling the user's computer to complete their task autonomously.

TASK: {}

Current state:
{}

Screen description: {}
Active window: {}
Has modal dialog: {}
Loading: {}
{}

Based on the screenshot, determine the next 1-3 actions to make progress on this task.

Available actions:
- {{"action": "click", "x": 100, "y": 200, "button": "left"}}
- {{"action": "double_click", "x": 100, "y": 200}}
- {{"action": "right_click", "x": 100, "y": 200}}
- {{"action": "type", "text": "hello world", "delay_ms": 10}}
- {{"action": "key_press", "key": "Enter"}}
- {{"action": "hotkey", "modifiers": ["ctrl"], "key": "c"}}
- {{"action": "scroll", "direction": "down", "amount": 3}}
- {{"action": "drag", "from": {{"x": 100, "y": 100}}, "to": {{"x": 200, "y": 200}}}}
- {{"action": "wait", "condition": {{"type": "duration", "ms": 1000}}}}
- {{"action": "focus_window", "title": "Application Name"}}
- {{"action": "zoom", "region": {{"left": 100, "top": 200, "width": 50, "height": 30}}, "zoom_level": 4.0}}

Use the zoom action when:
- An element is too small to identify accurately
- Text is hard to read and you need better OCR
- You need to inspect fine details of a UI element
Zoom levels: 2.0 (2x), 4.0 (4x), 8.0 (8x maximum detail)

Respond with JSON:
{{
  "task_complete": false,
  "making_progress": true,
  "actions": [
    // 1-3 action objects
  ],
  "reasoning": "Brief explanation of why these actions will help"
}}

If the task is complete, respond with:
{{
  "task_complete": true,
  "making_progress": true,
  "actions": [],
  "reasoning": "Task is complete because..."
}}

Be precise with coordinates - click at the center of the target element.
Only include actions you're confident will make progress."#,
            task.description,
            history,
            observation.analysis.screen_description,
            observation
                .analysis
                .active_window
                .as_deref()
                .unwrap_or("Unknown"),
            observation.analysis.has_modal,
            observation.analysis.is_loading,
            success_indicators
        )
    }

    /// Calls the vision LLM with planning prompt.
    async fn call_vision_llm(&self, prompt: &str, image_base64: &str) -> Result<String> {
        let router = self.llm_router.read().await;

        let image_bytes = general_purpose::STANDARD
            .decode(image_base64)
            .context("Failed to decode base64 image")?;

        let multimodal_content = vec![
            ContentPart::Text {
                text: prompt.to_string(),
            },
            ContentPart::Image {
                image: ImageInput {
                    data: image_bytes,
                    format: ImageFormat::Png,
                    detail: ImageDetail::High,
                },
            },
        ];

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: String::new(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: Some(multimodal_content),
            }],
            model: String::new(),
            temperature: Some(0.2), // Low temperature for consistent planning
            max_tokens: Some(2048),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let preferences = crate::core::llm::llm_router::RouterPreferences {
            provider: None,
            model: None,
            strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
            context: Some(crate::core::llm::llm_router::RouterContext {
                requires_vision: true,
                ..Default::default()
            }),
            prefer_cloud_credits: false,
        };

        let candidates = router.candidates(&request, &preferences);
        if candidates.is_empty() {
            return Err(anyhow::anyhow!(
                "No vision-capable LLM providers configured"
            ));
        }

        let llm_future = router.invoke_candidate(&candidates[0], &request);
        let outcome = timeout(self.config.planning_timeout, llm_future)
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "Planning LLM request timed out after {:?}",
                    self.config.planning_timeout
                )
            })?
            .context("Planning LLM request failed")?;

        Ok(outcome.response.content)
    }

    /// Parses the action plan from LLM response.
    fn parse_action_plan(&self, response: &str) -> Result<ActionPlan> {
        // Extract JSON from response
        let json_str = if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                &response[start..=end]
            } else {
                response
            }
        } else {
            response
        };

        // Size limit check
        if json_str.len() > 100_000 {
            return Err(anyhow::anyhow!("Response too large"));
        }

        let parsed: serde_json::Value =
            serde_json::from_str(json_str).context("Failed to parse action plan JSON")?;

        let task_complete = parsed
            .get("task_complete")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let making_progress = parsed
            .get("making_progress")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let actions = if let Some(actions_arr) = parsed.get("actions").and_then(|v| v.as_array()) {
            actions_arr
                .iter()
                .filter_map(|a| self.parse_action(a).ok())
                .collect()
        } else {
            Vec::new()
        };

        // Limit actions per iteration
        let actions = actions.into_iter().take(5).collect();

        Ok(ActionPlan {
            task_complete,
            making_progress,
            actions,
        })
    }

    /// Parses a single action from JSON.
    fn parse_action(&self, value: &serde_json::Value) -> Result<ComputerUseAction> {
        let action_type = value
            .get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing action type"))?;

        match action_type {
            "click" => {
                let x = value.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = value.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let button = value
                    .get("button")
                    .and_then(|v| v.as_str())
                    .map(|b| match b {
                        "right" => MouseButton::Right,
                        "middle" => MouseButton::Middle,
                        _ => MouseButton::Left,
                    })
                    .unwrap_or(MouseButton::Left);

                Ok(ComputerUseAction::Click { x, y, button })
            }
            "double_click" => {
                let x = value.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = value.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                Ok(ComputerUseAction::DoubleClick { x, y })
            }
            "right_click" => {
                let x = value.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = value.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                Ok(ComputerUseAction::RightClick { x, y })
            }
            "type" => {
                let text = value
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let delay_ms = value.get("delay_ms").and_then(|v| v.as_u64()).unwrap_or(10);
                Ok(ComputerUseAction::Type { text, delay_ms })
            }
            "key_press" => {
                let key = value
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Enter")
                    .to_string();
                Ok(ComputerUseAction::KeyPress { key })
            }
            "hotkey" => {
                let modifiers = value
                    .get("modifiers")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| {
                                m.as_str().and_then(|s| match s.to_lowercase().as_str() {
                                    "ctrl" | "control" => Some(HotkeyModifier::Ctrl),
                                    "alt" | "option" => Some(HotkeyModifier::Alt),
                                    "shift" => Some(HotkeyModifier::Shift),
                                    "meta" | "cmd" | "command" | "win" => {
                                        Some(HotkeyModifier::Meta)
                                    }
                                    _ => None,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let key = value
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(ComputerUseAction::Hotkey { modifiers, key })
            }
            "scroll" => {
                let direction = value
                    .get("direction")
                    .and_then(|v| v.as_str())
                    .map(|d| match d {
                        "up" => ScrollDirection::Up,
                        "left" => ScrollDirection::Left,
                        "right" => ScrollDirection::Right,
                        _ => ScrollDirection::Down,
                    })
                    .unwrap_or(ScrollDirection::Down);
                let amount = value.get("amount").and_then(|v| v.as_i64()).unwrap_or(3) as i32;
                Ok(ComputerUseAction::Scroll {
                    direction,
                    amount,
                    at: None,
                })
            }
            "drag" => {
                let from = value
                    .get("from")
                    .ok_or_else(|| anyhow::anyhow!("Missing from"))?;
                let to = value
                    .get("to")
                    .ok_or_else(|| anyhow::anyhow!("Missing to"))?;

                let from_x = from.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let from_y = from.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let to_x = to.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let to_y = to.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

                Ok(ComputerUseAction::Drag {
                    from: Coordinate::new(from_x, from_y),
                    to: Coordinate::new(to_x, to_y),
                    duration_ms: 500,
                })
            }
            "wait" => {
                let condition = value
                    .get("condition")
                    .map(|c| {
                        let cond_type =
                            c.get("type").and_then(|v| v.as_str()).unwrap_or("duration");
                        match cond_type {
                            "duration" => WaitCondition::Duration {
                                ms: c.get("ms").and_then(|v| v.as_u64()).unwrap_or(1000),
                            },
                            "text_appears" => WaitCondition::TextAppears {
                                text: c
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                timeout_ms: c
                                    .get("timeout_ms")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(10000),
                            },
                            _ => WaitCondition::Duration { ms: 1000 },
                        }
                    })
                    .unwrap_or(WaitCondition::Duration { ms: 1000 });

                Ok(ComputerUseAction::Wait { condition })
            }
            "focus_window" => {
                let title = value
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(ComputerUseAction::FocusWindow { title })
            }
            "zoom" => {
                let region = value
                    .get("region")
                    .ok_or_else(|| anyhow::anyhow!("Missing region for zoom"))?;

                let left = region.get("left").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let top = region.get("top").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let width = region.get("width").and_then(|v| v.as_u64()).unwrap_or(100) as u32;
                let height = region.get("height").and_then(|v| v.as_u64()).unwrap_or(100) as u32;

                let zoom_level = value
                    .get("zoom_level")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(2.0) as f32;

                let capture_screenshot = value
                    .get("capture_screenshot")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);

                Ok(ComputerUseAction::Zoom {
                    region: ElementBounds::new(left, top, width, height),
                    zoom_level,
                    capture_screenshot,
                })
            }
            _ => Err(anyhow::anyhow!("Unknown action type: {}", action_type)),
        }
    }

    /// Executes a single action.
    async fn execute_action(&self, action: &ComputerUseAction) -> Result<()> {
        let primary_display = resolve_primary_display()?;

        match action {
            ComputerUseAction::Click { x, y, button } => {
                let mut mouse = MouseSimulator::new()?;
                let btn = match button {
                    MouseButton::Left => InputMouseButton::Left,
                    MouseButton::Right => InputMouseButton::Right,
                    MouseButton::Middle => InputMouseButton::Middle,
                };
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, btn)?;
            }
            ComputerUseAction::DoubleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.double_click(input_x, input_y).await?;
            }
            ComputerUseAction::TripleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
            }
            ComputerUseAction::RightClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                mouse.click(input_x, input_y, InputMouseButton::Right)?;
            }
            ComputerUseAction::Type { text, delay_ms } => {
                let mut keyboard = KeyboardSimulator::new()?;
                keyboard.send_text_with_delay(text, *delay_ms).await?;
            }
            ComputerUseAction::KeyPress { key } => {
                let mut keyboard = KeyboardSimulator::new()?;
                if let Some(k) = self.parse_key(key) {
                    keyboard.tap_key(k)?;
                }
            }
            ComputerUseAction::Hotkey { modifiers, key } => {
                let mut keyboard = KeyboardSimulator::new()?;
                let mods: Vec<enigo::Key> = modifiers
                    .iter()
                    .map(|m| match m {
                        HotkeyModifier::Ctrl => enigo::Key::Control,
                        HotkeyModifier::Alt => enigo::Key::Alt,
                        HotkeyModifier::Shift => enigo::Key::Shift,
                        HotkeyModifier::Meta => enigo::Key::Meta,
                    })
                    .collect();

                if let Some(k) = self.parse_key(key) {
                    keyboard.send_hotkey(&mods, k)?;
                }
            }
            ComputerUseAction::Scroll {
                direction,
                amount,
                at,
            } => {
                let mut mouse = MouseSimulator::new()?;

                if let Some(coord) = at {
                    let translated = translate_capture_coordinate(*coord, &primary_display);
                    mouse.move_to(translated.x, translated.y)?;
                }

                let scroll_amount = match direction {
                    ScrollDirection::Up | ScrollDirection::Left => *amount,
                    ScrollDirection::Down | ScrollDirection::Right => -*amount,
                };

                mouse.scroll(scroll_amount)?;
            }
            ComputerUseAction::Drag {
                from,
                to,
                duration_ms,
            } => {
                let mut mouse = MouseSimulator::new()?;
                let input_from = translate_capture_coordinate(*from, &primary_display);
                let input_to = translate_capture_coordinate(*to, &primary_display);
                mouse
                    .drag_and_drop(
                        input_from.x,
                        input_from.y,
                        input_to.x,
                        input_to.y,
                        *duration_ms,
                    )
                    .await?;
            }
            ComputerUseAction::MoveMouse { x, y, smooth } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                if *smooth {
                    mouse.move_to_smooth(input_x, input_y, 200).await?;
                } else {
                    mouse.move_to(input_x, input_y)?;
                }
            }
            ComputerUseAction::Wait { condition } => match condition {
                WaitCondition::Duration { ms } => {
                    sleep(Duration::from_millis(*ms)).await;
                }
                WaitCondition::TextAppears { text, timeout_ms } => {
                    let _ = self
                        .wait_for_text(text, Duration::from_millis(*timeout_ms))
                        .await;
                }
                WaitCondition::ScreenStable {
                    threshold_percent: _,
                    duration_ms,
                } => {
                    let _ = self
                        .visual_reasoner
                        .wait_for_stable(Duration::from_millis(*duration_ms))
                        .await;
                }
                WaitCondition::WindowAppears {
                    title_contains,
                    timeout_ms,
                } => {
                    let _ = self
                        .window_coordinator
                        .wait_for_window(title_contains, Duration::from_millis(*timeout_ms))
                        .await;
                }
                _ => {
                    sleep(Duration::from_millis(1000)).await;
                }
            },
            ComputerUseAction::Screenshot {
                region: _,
                save_path,
            } => {
                let screenshot = capture_primary_screen()?;
                if let Some(path) = save_path {
                    screenshot.pixels.save(path)?;
                }
            }
            ComputerUseAction::FocusWindow { title } => {
                self.window_coordinator.activate_by_title(title).await;
            }
            ComputerUseAction::LaunchApplication { name } => {
                self.window_coordinator.launch_application(name).await?;
            }
            ComputerUseAction::Copy => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('c'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('c'))?;
            }
            ComputerUseAction::Paste => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('v'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('v'))?;
            }
            ComputerUseAction::SelectAll => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('a'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('a'))?;
            }
            ComputerUseAction::Undo => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('z'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('z'))?;
            }
            ComputerUseAction::Redo => {
                let mut keyboard = KeyboardSimulator::new()?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(
                    &[enigo::Key::Meta, enigo::Key::Shift],
                    enigo::Key::Unicode('z'),
                )?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('y'))?;
            }
            ComputerUseAction::Zoom {
                region,
                zoom_level,
                capture_screenshot: _,
            } => {
                // Perform zoom operation using the zoom module
                let zoom_action = super::zoom::ZoomAction::new(
                    super::zoom::Region::from_element_bounds(region),
                    super::zoom::ZoomLevel::from_factor(*zoom_level),
                );
                let zoom_result = super::zoom::zoom_region(&zoom_action)?;
                // Feed zoomed image back into observation context for detailed analysis
                tracing::info!(
                    "Zoomed region at ({}, {}) {}x{} with {}x magnification — zoomed image {}x{} ({} bytes base64)",
                    region.left,
                    region.top,
                    region.width,
                    region.height,
                    zoom_level,
                    zoom_result.width,
                    zoom_result.height,
                    zoom_result.image_base64.len(),
                );
            }
        }

        Ok(())
    }

    /// Parses a key string to enigo Key.
    fn parse_key(&self, key: &str) -> Option<enigo::Key> {
        match key.to_lowercase().as_str() {
            "enter" | "return" => Some(enigo::Key::Return),
            "tab" => Some(enigo::Key::Tab),
            "space" => Some(enigo::Key::Space),
            "backspace" => Some(enigo::Key::Backspace),
            "delete" => Some(enigo::Key::Delete),
            "escape" | "esc" => Some(enigo::Key::Escape),
            "up" | "uparrow" => Some(enigo::Key::UpArrow),
            "down" | "downarrow" => Some(enigo::Key::DownArrow),
            "left" | "leftarrow" => Some(enigo::Key::LeftArrow),
            "right" | "rightarrow" => Some(enigo::Key::RightArrow),
            "home" => Some(enigo::Key::Home),
            "end" => Some(enigo::Key::End),
            "pageup" => Some(enigo::Key::PageUp),
            "pagedown" => Some(enigo::Key::PageDown),
            "f1" => Some(enigo::Key::F1),
            "f2" => Some(enigo::Key::F2),
            "f3" => Some(enigo::Key::F3),
            "f4" => Some(enigo::Key::F4),
            "f5" => Some(enigo::Key::F5),
            "f6" => Some(enigo::Key::F6),
            "f7" => Some(enigo::Key::F7),
            "f8" => Some(enigo::Key::F8),
            "f9" => Some(enigo::Key::F9),
            "f10" => Some(enigo::Key::F10),
            "f11" => Some(enigo::Key::F11),
            "f12" => Some(enigo::Key::F12),
            s if s.len() == 1 => s.chars().next().map(enigo::Key::Unicode),
            _ => None,
        }
    }

    /// Waits for text to appear on screen.
    async fn wait_for_text(&self, text: &str, timeout: Duration) -> Result<bool> {
        let start = Instant::now();
        let check_interval = Duration::from_millis(500);

        while start.elapsed() < timeout {
            if let Ok(Some(_)) = self.visual_reasoner.find_text(text).await {
                return Ok(true);
            }
            sleep(check_interval).await;
        }

        Ok(false)
    }

    /// Completes the task and returns the result.
    fn complete_task(
        &self,
        session: &mut ComputerUseSession,
        state: ExecutionState,
        reason: CompletionReason,
    ) -> Result<OpaLoopResult> {
        let success = matches!(reason, CompletionReason::TaskComplete);

        let outcome = if success {
            TaskOutcome::success(
                state.actions_executed,
                state.elapsed_ms,
                "Task completed successfully".to_string(),
            )
        } else {
            TaskOutcome::failure(
                state.actions_executed,
                state.elapsed_ms,
                format!("Task ended: {:?}", reason),
                vec![format!("{:?}", reason)],
            )
        };

        session.complete(outcome.clone());

        Ok(OpaLoopResult {
            success,
            reason,
            state,
            outcome,
        })
    }
}

/// Internal representation of a planned action set.
struct ActionPlan {
    task_complete: bool,
    making_progress: bool,
    actions: Vec<ComputerUseAction>,
}

fn translate_capture_coordinate(coord: Coordinate, display: &ScreenInfo) -> Coordinate {
    Coordinate::new(
        display.x + ((coord.x as f32) / display.scale_factor).round() as i32,
        display.y + ((coord.y as f32) / display.scale_factor).round() as i32,
    )
}

fn translate_capture_point(x: i32, y: i32, display: &ScreenInfo) -> (i32, i32) {
    let translated = translate_capture_coordinate(Coordinate::new(x, y), display);
    (translated.x, translated.y)
}

fn resolve_primary_display() -> Result<ScreenInfo> {
    let displays = list_displays()?;
    if let Some(primary) = displays.iter().find(|display| display.is_primary) {
        return Ok(primary.clone());
    }

    displays
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No display available for coordinate translation"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = ComputerUseConfig::default();
        assert_eq!(config.max_iterations, 100);
        assert_eq!(config.max_duration, Duration::from_secs(300));
        assert_eq!(config.max_consecutive_failures, 3);
    }

    #[test]
    fn test_execution_state_default() {
        let state = ExecutionState::default();
        assert_eq!(state.iteration, 0);
        assert_eq!(state.actions_executed, 0);
        assert!(state.making_progress);
        assert!(!state.task_complete);
    }

    #[test]
    fn test_completion_reason_serialization() {
        let reason = CompletionReason::TaskComplete;
        let json = serde_json::to_string(&reason).unwrap();
        assert!(json.contains("task_complete"));

        let reason = CompletionReason::TooManyFailures { failures: 5 };
        let json = serde_json::to_string(&reason).unwrap();
        assert!(json.contains("too_many_failures"));
        assert!(json.contains("5"));
    }

    #[test]
    fn test_translate_capture_coordinate_accounts_for_hidpi_scaling() {
        let display = ScreenInfo {
            id: 0,
            x: 100,
            y: 50,
            width: 1440,
            height: 900,
            scale_factor: 2.0,
            is_primary: true,
        };

        let translated = translate_capture_coordinate(Coordinate::new(400, 200), &display);
        assert_eq!(translated, Coordinate::new(300, 150));
    }
}
