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

/// A block the loop raises with no one in the turn is unattended. A pause the
/// loop opens for an answer is not, and carries its own value.
const OPA_RUN_IS_UNATTENDED: bool = true;
const ROUTED_ACTIONS_EXECUTED: u32 = 1;
const MAX_ROUTED_RESULT_CHARS: usize = 400;
const ROUTED_STEP_SEPARATOR: &str = " via ";
const ROUTED_RESULT_SEPARATOR: &str = ": ";
const UNAVAILABLE_STEP_SEPARATOR: &str = ": ";
const WARNING_SEPARATOR: &str = ", ";
const MAX_STEPS_PER_ITERATION: usize = 5;
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout};

use super::confirmation::{self, ConfirmationOutcome};
use super::step_routing::{self, PlannedStep, StepExecution};
use crate::automation::action_router::{
    ActionIntent, ActionRouter, DispatchError, RoutedCall, TierDispatch,
};
use crate::automation::input::{
    KeyboardSimulator, MouseButton as InputMouseButton, MouseSimulator,
};
use crate::automation::screen::{capture_primary_screen, list_displays, ScreenInfo};
use crate::automation::AutomationService;
use crate::core::llm::llm_router::LLMRouter;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest,
};

use super::app_permissions::AppPermissionManager;
use super::approval;
use super::safety::{ComputerUseSafetyLayer, SafetyConfig, SafetyDecision, SafetyReason};
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
    /// Stream 2: explicit model override for the planning vision LLM.
    /// `None` lets the router pick (typically the user's default vision
    /// model). Setting this to any vision-capable catalog model lets the user choose
    /// any vision-capable model from the catalog, this is the multi-
    /// provider differentiator vs Claude Cowork's Anthropic-only computer use.
    pub model: Option<String>,
    /// Stream 2: explicit provider override paired with `model`. When
    /// `Some`, the router targets this provider; when `None`, lets the
    /// router resolve from the model id.
    pub provider: Option<crate::core::llm::Provider>,
    /// TRUST BOUNDARY (desktop-trust-boundary-01): the active session's
    /// execution boundary, so the planning LLM call below routes to the
    /// correct trust boundary instead of the router's fail-closed
    /// Local-only default. `None` (the default, and the case for any caller
    /// that has not been updated to send this) stays Local-only.
    pub trust_mode: Option<agiworkforce_model_registry::TrustMode>,
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
            model: None,
            provider: None,
            trust_mode: None,
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

/// The refusal the user reads. `SafetyReason` is a tagged record built for the
/// approval contract, not a sentence, so the app-permission cases render
/// through the safety layer's own wording and the rest through the tag.
fn describe_safety_block(reason: &SafetyReason) -> String {
    match reason {
        SafetyReason::AppDenied { .. }
        | SafetyReason::AppHardBlocked { .. }
        | SafetyReason::AppRequiresApproval { .. } => {
            super::safety::describe_app_permission_block(reason)
        }
        other => serde_json::to_string(other).unwrap_or_else(|_| format!("{other:?}")),
    }
}

/// What the router settled for one task before the loop runs.
enum RoutedOutcome {
    Completed,
    Refused { reason: String },
    Visual,
}

/// What the router settled for one step inside the loop.
enum StepOutcome {
    Handled { summary: String },
    Refused { reason: String },
    Raw,
    Unavailable { detail: String },
}

/// Reason why the OPA loop completed.
///
/// A refusal the user gave and one the harness gave are different records: the
/// first names a step a person declined, the second a rule no answer lifts.
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
    ConfirmationDenied { tool: String },
    ConfirmationTimedOut { tool: String, seconds: u64 },
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
        // TRUST BOUNDARY (desktop-trust-boundary-01): the observe step must
        // route to the same execution boundary as the planning call, or
        // byok/cloud tasks dead-end at the very first observation.
        let mut visual_config = config.visual.clone();
        visual_config.trust_mode = config.trust_mode;
        let visual_reasoner = VisualReasoner::new(Arc::clone(&llm_router), visual_config);
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

    /// Creates a new Computer Use agent with an attached per-app permission
    /// registry. The agent will consult this registry on every action that
    /// would affect the foreground window, closing the per-app blocklist
    /// gap from today's architecture audit.
    pub fn with_app_permissions(
        llm_router: Arc<RwLock<LLMRouter>>,
        config: ComputerUseConfig,
        app_permissions: Arc<AppPermissionManager>,
    ) -> Result<Self> {
        // TRUST BOUNDARY (desktop-trust-boundary-01): same threading as
        // `new`, observe and plan must share one execution boundary.
        let mut visual_config = config.visual.clone();
        visual_config.trust_mode = config.trust_mode;
        let visual_reasoner = VisualReasoner::new(Arc::clone(&llm_router), visual_config);
        let safety_layer =
            ComputerUseSafetyLayer::with_app_permissions(config.safety.clone(), app_permissions);
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

    fn automation_service(&self) -> Option<Arc<AutomationService>> {
        use tauri::Manager;

        self.app_handle
            .as_ref()?
            .try_state::<Option<Arc<AutomationService>>>()
            .and_then(|state| state.inner().clone())
    }

    /// Asks the router which executor drives this task before the loop starts,
    /// so vision is reached only after the cheaper tiers have declined. A tier
    /// that accepted and then failed hands the task on; a tier whose call the
    /// user or the tool guard refused ends it, because the next tier would run
    /// the same action through a driver that never asked.
    async fn route_task(
        &self,
        task: &ComputerUseTask,
        session: &ComputerUseSession,
    ) -> RoutedOutcome {
        let automation = self.automation_service();
        let router = ActionRouter::for_desktop(automation.clone(), self.app_handle.clone());
        let decision = router.route(ActionIntent::from_task(task)).await;

        if let Some(app) = self.app_handle.as_ref() {
            crate::ui::events::emit_action_routed(app, &session.id, None, &decision);
        }

        let (Some(call), Some(automation)) = (decision.call.as_ref(), automation) else {
            return RoutedOutcome::Visual;
        };

        match self
            .dispatch_routed_call(call, automation, task, &session.id)
            .await
        {
            Ok(_) => RoutedOutcome::Completed,
            Err(DispatchError::Denied(reason)) => RoutedOutcome::Refused { reason },
            Err(DispatchError::Failed(_)) => RoutedOutcome::Visual,
        }
    }

    /// Asks the router which driver takes one planned step before the pointer
    /// does. The visual loop is the step's fallback, not the task's: a step the
    /// tiers can take is recorded on the same routing stream a top-level action
    /// is, carrying the index of the step it settled.
    async fn route_step(
        &self,
        step: &PlannedStep,
        step_index: u32,
        task: &ComputerUseTask,
        session_id: &str,
    ) -> StepOutcome {
        let Some(intent) = step.intent() else {
            return StepOutcome::Raw;
        };

        let automation = self.automation_service();
        let router = ActionRouter::for_desktop(automation.clone(), self.app_handle.clone());
        let decision = router.route(intent.clone()).await;

        if let Some(app) = self.app_handle.as_ref() {
            crate::ui::events::emit_action_routed(app, session_id, Some(step_index), &decision);
        }

        let declined = || StepOutcome::Unavailable {
            detail: step_routing::decline_summary(&decision),
        };

        let call = match step_routing::step_execution(step, &decision) {
            StepExecution::Drive(call) => call,
            StepExecution::Raw => return StepOutcome::Raw,
            StepExecution::Unavailable => return declined(),
        };

        let Some(automation) = automation else {
            return match step.raw() {
                Some(_) => StepOutcome::Raw,
                None => declined(),
            };
        };

        match self
            .dispatch_routed_call(call, automation, task, session_id)
            .await
        {
            Ok(result) => StepOutcome::Handled {
                summary: routed_step_summary(&step.label(), &call.driver, &result),
            },
            Err(DispatchError::Denied(reason)) => StepOutcome::Refused { reason },
            Err(DispatchError::Failed(detail)) => {
                tracing::warn!(
                    "Routed step '{}' failed on {}, falling back: {}",
                    call.tool,
                    call.driver,
                    detail
                );
                match step.raw() {
                    Some(_) => StepOutcome::Raw,
                    None => StepOutcome::Unavailable { detail },
                }
            }
        }
    }

    async fn dispatch_routed_call(
        &self,
        call: &RoutedCall,
        automation: Arc<AutomationService>,
        task: &ComputerUseTask,
        session_id: &str,
    ) -> Result<serde_json::Value, DispatchError> {
        let dispatch = TierDispatch::new(
            self.app_handle.clone(),
            automation,
            Arc::clone(&self.llm_router),
            self.config.trust_mode,
        );

        let outcome = dispatch.run(call, session_id, &task.description).await;

        if let Err(DispatchError::Failed(detail)) = &outcome {
            tracing::warn!(
                "Routed {:?} call '{}' failed: {}",
                call.tier,
                call.tool,
                detail
            );
        }

        outcome
    }

    /// Holds the step until the user answers.
    ///
    /// The pause is owned by the confirmation channel, not by this loop and not
    /// by the window: it survives the app losing focus, and an answer given on
    /// whichever surface raised the request resumes this same step through
    /// whichever driver the router picks for it. Without an app handle there is
    /// nobody to ask, so the step is denied rather than run.
    async fn confirm_step(
        &self,
        session: &mut ComputerUseSession,
        step_index: u32,
        action: &ComputerUseAction,
        decision: &SafetyDecision,
    ) -> ConfirmationOutcome {
        let Some(app) = self.app_handle.as_ref() else {
            tracing::warn!("A confirmation-gated step cannot be asked about with no window");
            return ConfirmationOutcome::Denied;
        };

        session.pause(decision.warnings.join(WARNING_SEPARATOR), action.clone());
        let outcome =
            confirmation::confirm_step(app, &session.id, step_index, action, decision).await;

        if outcome.is_approved() {
            session.resume();
        }

        outcome
    }

    fn emit_safety_approval(
        &self,
        session_id: &str,
        action: &ComputerUseAction,
        decision: &SafetyDecision,
    ) {
        let Some(app) = self.app_handle.as_ref() else {
            return;
        };

        let request = approval::approval_request(
            uuid::Uuid::new_v4().to_string(),
            session_id.to_string(),
            action,
            decision,
            OPA_RUN_IS_UNATTENDED,
        );
        crate::ui::events::emit_computer_use_approval(app, session_id, &request);
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

        match self.route_task(&task, &session).await {
            RoutedOutcome::Completed => {
                state.actions_executed = ROUTED_ACTIONS_EXECUTED;
                state.task_complete = true;
                return self.complete_task(&mut session, state, CompletionReason::TaskComplete);
            }
            RoutedOutcome::Refused { reason } => {
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::SafetyBlocked { reason },
                );
            }
            RoutedOutcome::Visual => {}
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

            // ACT: take each planned step, cheapest driver first
            for (index, step) in plan.steps.iter().enumerate() {
                let step_index = index as u32;

                // Per-app permission check: consult `WindowCoordinator::
                // get_active_window` and the app_permissions registry. Refuses
                // any action targeting an app on the always-blocked list
                // (investment / crypto / banking) and any app the user has
                // denied. Apps not yet decided trigger an approval request.
                if let Some(reason) = self.safety_layer.check_app_permission().await {
                    tracing::warn!("Action blocked by per-app permission: {:?}", reason);
                    let refusal = describe_safety_block(&reason);
                    if let Some(action) = step.raw() {
                        self.emit_safety_approval(
                            &session.id,
                            action,
                            &SafetyDecision::block(reason),
                        );
                    }
                    return self.complete_task(
                        &mut session,
                        state,
                        CompletionReason::SafetyBlocked { reason: refusal },
                    );
                }

                // The safety layer judges the raw form, because that is the
                // shape it computes risk from. A block stops the step whichever
                // driver would have taken it; a confirmation waits until the
                // driver is known, so that one step never asks twice.
                let mut safety = None;
                if let Some(action) = step.raw() {
                    let decision = self.safety_layer.evaluate_action(action);

                    if !decision.allowed {
                        let Some(reason) = decision.reason.as_ref() else {
                            continue;
                        };
                        tracing::warn!("Action blocked by safety: {:?}", reason);
                        let refusal = describe_safety_block(reason);
                        self.emit_safety_approval(&session.id, action, &decision);
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked { reason: refusal },
                        );
                    }

                    safety = Some(decision);
                }

                if session.is_cancelled() {
                    return self.complete_task(
                        &mut session,
                        state,
                        CompletionReason::UserCancelled,
                    );
                }

                match self.route_step(step, step_index, &task, &session.id).await {
                    StepOutcome::Handled { summary } => {
                        state.actions_executed += 1;
                        state.consecutive_failures = 0;
                        state.last_action = Some(summary);
                        sleep(self.config.action_delay).await;
                        continue;
                    }
                    StepOutcome::Refused { reason } => {
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked { reason },
                        );
                    }
                    StepOutcome::Unavailable { detail } => {
                        tracing::warn!("No driver took step {}: {}", step_index, detail);
                        state.consecutive_failures += 1;
                        state.last_action = Some(unavailable_step_summary(&step.label(), &detail));
                        sleep(self.config.action_delay).await;
                        continue;
                    }
                    StepOutcome::Raw => {}
                }

                let Some(action) = step.raw() else {
                    continue;
                };

                // A step no driver below vision would take is about to move the
                // real pointer, so this is where a flagged one stops and asks.
                // A tier that took it cleared the tool guard instead, which is
                // the same channel and the same standing-grant rule.
                if let Some(decision) = safety.filter(|decision| decision.requires_confirmation) {
                    match self
                        .confirm_step(&mut session, step_index, action, &decision)
                        .await
                    {
                        ConfirmationOutcome::Approved => {}
                        ConfirmationOutcome::Denied => {
                            return self.complete_task(
                                &mut session,
                                state,
                                CompletionReason::ConfirmationDenied {
                                    tool: approval::action_tool_name(action),
                                },
                            );
                        }
                        ConfirmationOutcome::Expired => {
                            return self.complete_task(
                                &mut session,
                                state,
                                CompletionReason::ConfirmationTimedOut {
                                    tool: approval::action_tool_name(action),
                                    seconds: confirmation::CONFIRMATION_TIMEOUT_SECS,
                                },
                            );
                        }
                    }
                }

                // Capture before screenshot
                let before = session.capture_before(action)?;

                // Execute the action
                let action_start = Instant::now();
                let result = self.execute_action(action).await;
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

        self.parse_action_plan(&response, task.target_application.as_deref())
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
- {{"action": "read", "target": "the Total label"}}
- {{"action": "navigate", "url": "https://example.com/pricing"}}

Name the control a step addresses whenever you can read its label, by adding
"target" to a click, type or scroll step: "target": "the Send button",
"target": "the Search field", "target": "the Notifications switch". Add "value"
to a click on a list or dropdown to pick one entry: "value": "French".
A named control is acted on directly through the application, which is exact
and needs no coordinates; keep the coordinates in the same step, they are used
when the control cannot be reached that way. Use "read" only to read a named
value back, and "navigate" only for a page in a browser this app is connected
to; neither has a pointer fallback.

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
            // Stream 2: honor an explicit model override from the config so
            // the user can choose any vision-capable model (Claude / GPT /
            // Gemini / Grok / Llama) for computer use, not just Anthropic.
            model: self.config.model.clone().unwrap_or_default(),
            temperature: Some(0.2), // Low temperature for consistent planning
            max_tokens: Some(2048),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        let preferences = crate::core::llm::llm_router::RouterPreferences {
            provider: self.config.provider,
            model: self.config.model.clone(),
            strategy: crate::core::llm::llm_router::RoutingStrategy::Auto,
            context: Some(crate::core::llm::llm_router::RouterContext {
                requires_vision: true,
                ..Default::default()
            }),
            prefer_cloud_credits: false,
            local_only: false,
            managed_cloud_only: false,
            // TRUST BOUNDARY (desktop-trust-boundary-01): threaded from
            // config so an explicit `self.config.provider` (a BYOK/
            // ManagedCloud choice from `computer_use_execute_opa_task`) is
            // not rejected by the router's fail-closed Local default when
            // the caller has supplied a real trust_mode. Still fails closed
            // to Local when the caller has not (see
            // `sys/commands/computer_use.rs`).
            trust_mode: self.config.trust_mode,
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
    fn parse_action_plan(&self, response: &str, application: Option<&str>) -> Result<ActionPlan> {
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

        let steps = parsed
            .get("actions")
            .and_then(|v| v.as_array())
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(|entry| self.parse_step(entry, application))
                    .take(MAX_STEPS_PER_ITERATION)
                    .collect()
            })
            .unwrap_or_default();

        Ok(ActionPlan {
            task_complete,
            making_progress,
            steps,
        })
    }

    /// Reads one plan entry as the step the loop will take.
    ///
    /// A step that names the control it addresses can be offered to the tiers
    /// below vision; one that does not can only be driven as raw input. The two
    /// verbs the raw vocabulary cannot express carry no fallback, so an entry
    /// naming one that resolves to nothing is dropped rather than turned into a
    /// pointer movement the planner did not ask for.
    fn parse_step(
        &self,
        entry: &serde_json::Value,
        application: Option<&str>,
    ) -> Option<PlannedStep> {
        let intent = step_routing::step_intent(entry, application);

        if step_routing::is_routed_only(entry) {
            return intent.map(|intent| PlannedStep::Routed { intent });
        }

        let action = self.parse_action(entry).ok()?;

        Some(match intent {
            Some(intent) => PlannedStep::Targeted { intent, action },
            None => PlannedStep::Direct { action },
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
                    "Zoomed region at ({}, {}) {}x{} with {}x magnification, zoomed image {}x{} ({} bytes base64)",
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
    steps: Vec<PlannedStep>,
}

/// What the loop records for a step a driver took, so the next plan is told
/// which step ran, on what, and what it read back.
fn routed_step_summary(label: &str, driver: &str, result: &serde_json::Value) -> String {
    let rendered = match result {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(text) => text.clone(),
        other => other.to_string(),
    };

    if rendered.is_empty() {
        return format!("{label}{ROUTED_STEP_SEPARATOR}{driver}");
    }

    let truncated: String = rendered.chars().take(MAX_ROUTED_RESULT_CHARS).collect();
    format!("{label}{ROUTED_STEP_SEPARATOR}{driver}{ROUTED_RESULT_SEPARATOR}{truncated}")
}

fn unavailable_step_summary(label: &str, detail: &str) -> String {
    format!("{label}{UNAVAILABLE_STEP_SEPARATOR}{detail}")
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
    fn constructors_thread_trust_mode_into_visual_reasoner() {
        let config = ComputerUseConfig {
            trust_mode: Some(agiworkforce_model_registry::TrustMode::Byok),
            ..Default::default()
        };

        let router = Arc::new(RwLock::new(LLMRouter::new()));
        let agent = ComputerUseAgent::new(Arc::clone(&router), config.clone()).unwrap();
        assert_eq!(
            agent.visual_reasoner.trust_mode(),
            Some(agiworkforce_model_registry::TrustMode::Byok)
        );

        let agent = ComputerUseAgent::with_app_permissions(
            router,
            config,
            Arc::new(AppPermissionManager::default()),
        )
        .unwrap();
        assert_eq!(
            agent.visual_reasoner.trust_mode(),
            Some(agiworkforce_model_registry::TrustMode::Byok)
        );
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
