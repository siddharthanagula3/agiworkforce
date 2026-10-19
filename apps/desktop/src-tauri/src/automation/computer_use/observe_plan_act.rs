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
const NO_EXECUTABLE_ACTION: &str = "The step carried no action any driver could take.";
const CONFIRMATION_DENIED: &str = "The user declined this step.";
const CONFIRMATION_TIMED_OUT: &str = "The confirmation was not answered in time.";
const INPUT_WAS_DELIVERED: &str = "the input was delivered to the target display";
const NO_APP_IN_PLANNED_FRAME: &str =
    "The frame this step was planned on does not say which app it showed, so nothing was sent.";
const MAX_FOCUS_MOVES_PER_RUN_OF_STEPS: u32 = 3;
const RAW_INPUT_NEEDS_APP_HANDLE: &str =
    "Pointer and keyboard input need the desktop app handle to check the app in front.";
const UNKNOWN_FOREGROUND: &str = "unknown";
const COMPUTER_USE_CAPABILITY: &str = "automation";
use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio::time::{sleep, timeout};
use tokio_util::sync::CancellationToken;

use super::confirmation::{self, ConfirmationOutcome};
use super::control::{self, ObservationStamp};
use super::step_routing::{self, PlannedStep, StepExecution};
use crate::automation::action_router::{
    ActionIntent, ActionRouter, DispatchError, RoutedCall, TierDispatch,
};
use crate::automation::audit::{
    authorize_automation_action, AutomationAuthority, AutomationDecision, AutomationGates,
    AutomationRequest, AutomationSurface,
};
use crate::automation::input::{
    KeyboardSimulator, MouseButton as InputMouseButton, MouseSimulator,
};
use crate::automation::screen::ScreenInfo;
use crate::automation::AutomationService;
use crate::core::llm::llm_router::LLMRouter;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest,
};

use super::app_permissions::AppPermissionManager;
use super::approval;
use super::safety::{ComputerUseSafetyLayer, SafetyConfig, SafetyDecision, SafetyReason};
use super::session::{ComputerUseSession, SessionConfig};
use super::target_app::TargetApp;
use super::targeted_input::{
    type_in_chunks, FrontAppChanged, RawInputRefusal, TypingSink, TypingStopped, TYPING_CHUNK_CHARS,
};
use super::types::{
    ComputerUseAction, ComputerUseTask, Coordinate, ElementBounds, HotkeyModifier, MouseButton,
    ScrollDirection, TaskOutcome, TaskProgress, WaitCondition,
};
use super::visual_reasoner::{VisualReasoner, VisualReasonerConfig};
use super::window_manager::{WindowCoordinator, WindowEnumerator, WindowManagerConfig};

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
    /// How long a screenshot may be used as the basis for a pointer coordinate
    /// before the screen is observed again.
    pub observation_max_age: Duration,
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
            observation_max_age: control::DEFAULT_OBSERVATION_MAX_AGE,
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

/// The desktop and the model as `settle_front_app` needs them.
struct RunStartSurface<'a> {
    agent: &'a ComputerUseAgent,
    handle: &'a AppHandle,
}

#[async_trait::async_trait]
impl super::run_start::StartSurface for RunStartSurface<'_> {
    async fn front(&self) -> super::run_start::FrontAppState {
        super::targeted_input::front_app_state(self.handle).await
    }

    fn resolve(&self, name: &str) -> std::result::Result<super::target_app::TargetApp, String> {
        super::target_app::resolve_target_app(name).or_else(|not_running| {
            window_owner(name)
                .ok_or(not_running)
                .and_then(|owner| super::target_app::resolve_target_app(&owner))
        })
    }

    async fn candidates(
        &self,
    ) -> std::result::Result<Vec<super::run_start::StartCandidate>, String> {
        crate::sys::commands::computer_use::start_candidates(
            self.handle,
            super::target_app::running_target_apps()?,
        )
        .await
    }

    async fn choose(&self, prompt: &str) -> std::result::Result<String, String> {
        self.agent
            .call_llm(prompt, None)
            .await
            .map_err(|e| format!("The app to start in could not be chosen: {e}"))
    }

    async fn authorize(
        &self,
        app: &super::target_app::TargetApp,
    ) -> std::result::Result<(), String> {
        crate::sys::commands::computer_use::refuse_app(self.handle, app).await
    }

    async fn activate(
        &self,
        app: &super::target_app::TargetApp,
    ) -> std::result::Result<(), String> {
        let automation = crate::automation::shared_service(self.handle)?;
        super::target_app::bring_to_front(&automation, app).await
    }
}

/// The reason, when a step failed because another app took focus after the
/// frame it was planned on, whether before the event or part-way through
/// typing.
fn front_app_moved(error: &anyhow::Error) -> Option<String> {
    if let Some(changed) = error.downcast_ref::<FrontAppChanged>() {
        return Some(changed.to_string());
    }
    error
        .downcast_ref::<TypingStopped>()
        .filter(|stopped| stopped.front_app_changed)
        .map(|stopped| stopped.to_string())
}

/// Typing for the run loop: each chunk is preceded by the same check a click
/// gets, against the app the plan was made for.
struct GuardedTyping<'a> {
    agent: &'a ComputerUseAgent,
    planned_for: Option<&'a TargetApp>,
    keyboard: KeyboardSimulator,
    delay_ms: u64,
}

#[async_trait::async_trait]
impl TypingSink for GuardedTyping<'_> {
    async fn check_front_app(&mut self) -> std::result::Result<(), RawInputRefusal> {
        self.agent.check_raw_input(self.planned_for, &[]).await
    }

    async fn send(&mut self, chunk: &str) -> std::result::Result<(), String> {
        self.keyboard
            .send_text_with_delay(chunk, self.delay_ms)
            .await
            .map_err(|e| e.to_string())
    }
}

/// A capture that failed is worth another try; one refused because of the app
/// in front is not, and ends the wait with that refusal.
fn stop_on_refused_capture(error: anyhow::Error) -> Result<()> {
    if error
        .downcast_ref::<super::visual_reasoner::CaptureRefused>()
        .is_some()
    {
        return Err(error);
    }
    Ok(())
}

/// The app that owns the first window whose title matches.
fn window_owner(title: &str) -> Option<String> {
    WindowEnumerator::find_by_title(title)
        .ok()?
        .into_iter()
        .next()
        .map(|window| window.process_name)
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
/// Who the audit trail names for a run. Empty until the caller that knows the
/// signed-in account and the registered device supplies them.
#[derive(Debug, Clone, Default)]
pub struct AuditIdentity {
    pub actor: String,
    pub device_id: String,
}

pub struct ComputerUseAgent {
    llm_router: Arc<RwLock<LLMRouter>>,
    config: ComputerUseConfig,
    visual_reasoner: VisualReasoner,
    safety_layer: ComputerUseSafetyLayer,
    window_coordinator: WindowCoordinator,
    app_handle: Option<AppHandle>,
    audit_identity: AuditIdentity,
    cancellation: CancellationToken,
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
            audit_identity: AuditIdentity::default(),
            cancellation: CancellationToken::new(),
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
            audit_identity: AuditIdentity::default(),
            cancellation: CancellationToken::new(),
        })
    }

    /// Creates an agent with default configuration.
    pub fn with_defaults(llm_router: Arc<RwLock<LLMRouter>>) -> Result<Self> {
        Self::new(llm_router, ComputerUseConfig::default())
    }

    /// The guard every step passes, and the row it leaves. The app in front is
    /// the authority here: a site profile governs a browser, the permission the
    /// user gave an app governs the desktop.
    fn authorize_step(
        &self,
        run_id: &str,
        action: &str,
        foreground: &Option<super::window_manager::ActiveWindow>,
    ) -> AutomationDecision {
        let app = foreground
            .as_ref()
            .map(|window| {
                window
                    .bundle_id
                    .clone()
                    .unwrap_or_else(|| window.app_name.clone())
            })
            .unwrap_or_else(|| UNKNOWN_FOREGROUND.to_string());

        authorize_automation_action(
            AutomationRequest {
                run_id: run_id.to_string(),
                actor: self.audit_identity.actor.clone(),
                device_id: self.audit_identity.device_id.clone(),
                surface: AutomationSurface::ComputerUse,
                target: app.clone(),
                action: action.to_string(),
                capability: COMPUTER_USE_CAPABILITY.to_string(),
            },
            AutomationGates {
                consent_accepted: super::consent::consent_is_live(),
                permission_prompt_on_screen: super::consent::consent_prompt_is_on_screen(),
                authority: Some(AutomationAuthority::AppPermission {
                    app: &app,
                    granted: true,
                }),
                now: chrono::Utc::now(),
            },
        )
    }

    /// Stops the run at its next step once the token is cancelled.
    pub fn with_cancellation(mut self, cancellation: CancellationToken) -> Self {
        self.cancellation = cancellation;
        self
    }

    /// Sets the app handle for event emission.
    pub fn with_app_handle(mut self, app_handle: AppHandle) -> Self {
        self.visual_reasoner.set_app_handle(app_handle.clone());
        self.app_handle = Some(app_handle);
        self
    }

    fn automation_service(&self) -> Option<Arc<AutomationService>> {
        crate::automation::shared_service(self.app_handle.as_ref()?).ok()
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

        let (Some(call), true) = (decision.call.as_ref(), automation.is_some()) else {
            return RoutedOutcome::Visual;
        };

        match self.dispatch_routed_call(call, task).await {
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

        if automation.is_none() {
            return match step.raw() {
                Some(_) => StepOutcome::Raw,
                None => declined(),
            };
        }

        match self.dispatch_routed_call(call, task).await {
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
        task: &ComputerUseTask,
    ) -> Result<serde_json::Value, DispatchError> {
        let dispatch = TierDispatch::new(
            self.app_handle.clone(),
            Arc::clone(&self.llm_router),
            self.config.trust_mode,
        );

        let outcome = dispatch.run(call, &task.id, &task.description).await;

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
            match window_owner(app_name) {
                Some(owner) => {
                    if let Err(reason) = self.ensure_app_may_be_raised(&owner).await {
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked {
                                reason: reason.to_string(),
                            },
                        );
                    }
                    self.window_coordinator.activate_by_title(app_name).await;
                }
                None => tracing::warn!("Could not activate target application: no window matches"),
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

        let mut focus_moves = 0u32;

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

            if self.cancellation.is_cancelled() {
                return self.complete_task(&mut session, state, CompletionReason::UserCancelled);
            }

            if let Some(reason) = self.switched_off().await {
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::SafetyBlocked { reason },
                );
            }

            // The app in front is settled before the screen is captured. A
            // frame of an app this run may not touch, or of this app's own
            // window, is never taken; with this app in front, as it is when a
            // run starts and when a confirmation hands focus back, the run
            // moves to the app it works in first.
            if let Some(reason) = self
                .settle_front_app_before_observing(&task, &session.id)
                .await
            {
                return self.complete_task(
                    &mut session,
                    state,
                    CompletionReason::SafetyBlocked { reason },
                );
            }

            // OBSERVE: Capture and analyze screen. The stamp is minted before
            // the capture, so its age is an upper bound on the picture's age.
            let observed_at = ObservationStamp::now();
            let observation = match self.visual_reasoner.observe_screen().await {
                Ok(obs) => obs,
                Err(e) => {
                    tracing::error!("Failed to observe screen: {}", e);
                    state.consecutive_failures += 1;
                    sleep(self.config.iteration_delay).await;
                    continue;
                }
            };

            // The plan made on this frame is for the app the frame shows.
            let planned_for = observation.front_app.clone();

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

                // Coordinates only mean something against the screen they were
                // read from, so a takeover or a stale snapshot sends the loop
                // back to observe rather than clicking where something used to be.
                if let Err(stale) = control::observation_is_actionable(
                    &observed_at,
                    self.config.observation_max_age,
                ) {
                    tracing::info!("Observing again before the next step: {}", stale.message());
                    state.last_action = Some(stale.message().to_string());
                    break;
                }

                let foreground = WindowCoordinator::get_active_window();

                // Per-app permission check: consult `WindowCoordinator::
                // get_active_window` and the app_permissions registry. Refuses
                // any action targeting an app on the always-blocked list
                // (investment / crypto / banking) and any app the user has
                // denied. Apps not yet decided trigger an approval request.
                if let Some(reason) = self
                    .safety_layer
                    .check_foreground_app(foreground.clone())
                    .await
                {
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

                if self.cancellation.is_cancelled() {
                    return self.complete_task(
                        &mut session,
                        state,
                        CompletionReason::UserCancelled,
                    );
                }

                // The one gate: consent, the permission prompt, the kill switch
                // and whatever grants this app, and a trail row either way.
                let ticket = match self.authorize_step(&session.id, &step.label(), &foreground) {
                    AutomationDecision::Allowed(ticket) => ticket,
                    AutomationDecision::Refused { reason } => {
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked { reason },
                        );
                    }
                };

                match self.route_step(step, step_index, &task, &session.id).await {
                    StepOutcome::Handled { summary } => {
                        ticket.succeeded(summary.as_str(), true, None);
                        state.actions_executed += 1;
                        state.consecutive_failures = 0;
                        state.last_action = Some(summary);
                        sleep(self.config.action_delay).await;
                        continue;
                    }
                    StepOutcome::Refused { reason } => {
                        ticket.refused(reason.as_str());
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked { reason },
                        );
                    }
                    StepOutcome::Unavailable { detail } => {
                        ticket.failed(detail.as_str());
                        tracing::warn!("No driver took step {}: {}", step_index, detail);
                        state.consecutive_failures += 1;
                        state.last_action = Some(unavailable_step_summary(&step.label(), &detail));
                        sleep(self.config.action_delay).await;
                        continue;
                    }
                    StepOutcome::Raw => {}
                }

                let Some(action) = step.raw() else {
                    ticket.failed(NO_EXECUTABLE_ACTION);
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
                            ticket.refused(CONFIRMATION_DENIED);
                            return self.complete_task(
                                &mut session,
                                state,
                                CompletionReason::ConfirmationDenied {
                                    tool: approval::action_tool_name(action),
                                },
                            );
                        }
                        ConfirmationOutcome::Expired => {
                            ticket.refused(CONFIRMATION_TIMED_OUT);
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

                // The step was judged before routing and any confirmation
                // wait, so the app in front is judged again before its frame.
                if let Err(refusal) = self
                    .visual_reasoner
                    .ensure_front_app_may_be_captured()
                    .await
                {
                    let reason = refusal.to_string();
                    ticket.refused(reason.as_str());
                    return self.complete_task(
                        &mut session,
                        state,
                        CompletionReason::SafetyBlocked { reason },
                    );
                }

                // Capture before screenshot
                let before = session.capture_before(action)?;

                // Execute the action
                let action_start = Instant::now();
                let result = self.execute_action(action, planned_for.as_ref()).await;
                let duration_ms = action_start.elapsed().as_millis() as u64;

                // Another app took focus after the frame this plan was made
                // on. The step is not replayed into the newcomer: the screen
                // is observed and planned again, a bounded number of times.
                if let Some(moved) = result.as_ref().err().and_then(front_app_moved) {
                    ticket.refused(moved.as_str());
                    focus_moves += 1;
                    if focus_moves > MAX_FOCUS_MOVES_PER_RUN_OF_STEPS {
                        return self.complete_task(
                            &mut session,
                            state,
                            CompletionReason::SafetyBlocked {
                                reason: format!(
                                    "{moved} Focus kept moving away ({focus_moves} times in a row), so the step was ended. Keep the app in front and start again."
                                ),
                            },
                        );
                    }
                    state.last_action = Some(moved);
                    break;
                }

                // Record the action
                let (success, error) = match &result {
                    Ok(()) => (true, None),
                    Err(e) => (false, Some(e.to_string())),
                };

                match &error {
                    None => ticket.succeeded(INPUT_WAS_DELIVERED, true, None),
                    Some(reason) => ticket.failed(reason.as_str()),
                }

                let after_frame = if session.config.capture_after_action {
                    self.visual_reasoner.capture_frame_unless_refused().await?
                } else {
                    None
                };
                session.record_action(
                    action.clone(),
                    before,
                    after_frame,
                    success,
                    error.clone(),
                    duration_ms,
                )?;

                state.last_action = Some(action.description());

                if success {
                    focus_moves = 0;
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
- {{"action": "choose_file", "path": "/Users/me/Documents/report.pdf"}}
- {{"action": "respond_to_dialog", "response": "accept"}}
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
        self.call_llm(prompt, Some(image_base64)).await
    }

    /// With no image this is the one planning call made before any capture:
    /// the model sees the task and app names, and nothing from the screen.
    async fn call_llm(&self, prompt: &str, image_base64: Option<&str>) -> Result<String> {
        let router = self.llm_router.read().await;

        let mut multimodal_content = vec![ContentPart::Text {
            text: prompt.to_string(),
        }];
        if let Some(image_base64) = image_base64 {
            multimodal_content.push(ContentPart::Image {
                image: ImageInput {
                    data: general_purpose::STANDARD
                        .decode(image_base64)
                        .context("Failed to decode base64 image")?,
                    format: ImageFormat::Png,
                    detail: ImageDetail::High,
                },
            });
        }

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
                requires_vision: image_base64.is_some(),
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
            "choose_file" => {
                let path = value
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing path for choose_file"))?;
                Ok(ComputerUseAction::ChooseFile {
                    path: path.to_string(),
                })
            }
            "respond_to_dialog" => {
                let response = match value.get("response").and_then(|v| v.as_str()) {
                    Some("accept") => super::control::DialogResponse::Accept,
                    Some("cancel") => super::control::DialogResponse::Cancel,
                    _ => {
                        return Err(anyhow::anyhow!(
                            "respond_to_dialog needs response accept or cancel"
                        ))
                    }
                };
                Ok(ComputerUseAction::RespondToDialog { response })
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

    async fn settle_front_app_before_observing(
        &self,
        task: &ComputerUseTask,
        session_id: &str,
    ) -> Option<String> {
        let Some(handle) = self.app_handle.as_ref() else {
            return self
                .safety_layer
                .check_app_permission()
                .await
                .map(|reason| describe_safety_block(&reason));
        };
        let surface = RunStartSurface {
            agent: self,
            handle,
        };
        let refusal = super::run_start::settle_front_app(
            &surface,
            &task.description,
            task.target_application.as_deref(),
        )
        .await
        .err()?;
        // The approval request names the app in front, so it is raised only
        // when that app, not this one, is what stopped the run.
        let stopped_by_front_app = matches!(
            super::targeted_input::front_app_state(handle).await,
            super::run_start::FrontAppState::Refused(_)
        );
        if stopped_by_front_app {
            if let Some(reason) = self.safety_layer.check_app_permission().await {
                self.emit_safety_approval(
                    session_id,
                    &ComputerUseAction::Screenshot {
                        region: None,
                        save_path: None,
                    },
                    &SafetyDecision::block(reason),
                );
            }
        }
        Some(refusal)
    }

    /// Raises the window a step or the task names, once the app that owns it
    /// has passed the refuse-list and the per-app registry. Raising is how an
    /// app gets on screen for the next capture, so it is gated like input.
    async fn raise_window(&self, title: &str) -> Result<()> {
        let owner =
            window_owner(title).ok_or_else(|| anyhow::anyhow!("No window matches '{title}'"))?;
        self.ensure_app_may_be_raised(&owner).await?;
        self.window_coordinator.activate_by_title(title).await;
        Ok(())
    }

    async fn ensure_app_may_be_raised(&self, app_name: &str) -> Result<()> {
        let handle = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!(RAW_INPUT_NEEDS_APP_HANDLE))?;
        super::targeted_input::ensure_app_may_be_raised(handle, app_name)
            .await
            .map_err(|refusal| anyhow::anyhow!(refusal))
    }

    /// Sends a paced key sequence one stroke at a time, judging the app in
    /// front before each: a sequence spans pauses long enough for another app
    /// to take focus between two keys.
    async fn send_paced_keystrokes(
        &self,
        planned_for: Option<&TargetApp>,
        strokes: &[super::control::PickerKeystroke],
    ) -> Result<()> {
        for stroke in strokes {
            self.guard_raw_input(planned_for, &[]).await?;
            super::action_executor::run_keystrokes(std::slice::from_ref(stroke)).await?;
        }
        Ok(())
    }

    /// The last check before a raw event leaves this process. The per-app check
    /// in the loop ran before routing and before any confirmation wait, so the
    /// app in front is read and judged again here, and each point the event
    /// touches must lie on that app's window rather than on a neighbour's or
    /// on this app's own.
    async fn guard_raw_input(
        &self,
        planned_for: Option<&TargetApp>,
        points: &[(i32, i32)],
    ) -> Result<()> {
        self.check_raw_input(planned_for, points)
            .await
            .map_err(|refusal| match refusal {
                RawInputRefusal::FrontAppChanged(changed) => anyhow::Error::new(changed),
                RawInputRefusal::Refused(reason) => anyhow::anyhow!(reason),
            })
    }

    async fn check_raw_input(
        &self,
        planned_for: Option<&TargetApp>,
        points: &[(i32, i32)],
    ) -> std::result::Result<(), RawInputRefusal> {
        let handle = self
            .app_handle
            .as_ref()
            .ok_or_else(|| RawInputRefusal::Refused(RAW_INPUT_NEEDS_APP_HANDLE.to_string()))?;
        let planned_for = planned_for
            .ok_or_else(|| RawInputRefusal::Refused(NO_APP_IN_PLANNED_FRAME.to_string()))?;
        super::targeted_input::guard_front_app_input(handle, planned_for, points).await
    }

    /// Executes a single action.
    /// Why this run may not act, when Computer control was switched off in
    /// Settings after it started. Asked before each observation and each
    /// action, so a run stops at its next step.
    async fn switched_off(&self) -> Option<String> {
        let app = self.app_handle.as_ref()?;
        crate::sys::commands::capabilities::capability_refusal(app, "computer_use").await
    }

    async fn execute_action(
        &self,
        action: &ComputerUseAction,
        planned_for: Option<&TargetApp>,
    ) -> Result<()> {
        super::control::ensure_agent_in_control()?;
        if let Some(off) = self.switched_off().await {
            return Err(anyhow::anyhow!(off));
        }
        let parameters: std::collections::HashMap<String, serde_json::Value> =
            match serde_json::to_value(action) {
                Ok(serde_json::Value::Object(fields)) => fields.into_iter().collect(),
                _ => std::collections::HashMap::new(),
            };
        crate::ui::hooks::gate_tool_use("computer_use", parameters)
            .await
            .map_err(|refusal| anyhow::anyhow!(refusal))?;
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
                self.guard_raw_input(planned_for, &[(input_x, input_y)])
                    .await?;
                mouse.click(input_x, input_y, btn)?;
            }
            ComputerUseAction::DoubleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                self.guard_raw_input(planned_for, &[(input_x, input_y)])
                    .await?;
                mouse.double_click(input_x, input_y).await?;
            }
            ComputerUseAction::TripleClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                self.guard_raw_input(planned_for, &[(input_x, input_y)])
                    .await?;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
                sleep(Duration::from_millis(50)).await;
                mouse.click(input_x, input_y, InputMouseButton::Left)?;
            }
            ComputerUseAction::RightClick { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                let (input_x, input_y) = translate_capture_point(*x, *y, &primary_display);
                self.guard_raw_input(planned_for, &[(input_x, input_y)])
                    .await?;
                mouse.click(input_x, input_y, InputMouseButton::Right)?;
            }
            ComputerUseAction::Type { text, delay_ms } => {
                let mut typing = GuardedTyping {
                    agent: self,
                    planned_for,
                    keyboard: KeyboardSimulator::new()?,
                    delay_ms: *delay_ms,
                };
                type_in_chunks(&mut typing, text, TYPING_CHUNK_CHARS)
                    .await
                    .map_err(anyhow::Error::new)?;
            }
            ComputerUseAction::KeyPress { key } => {
                let mut keyboard = KeyboardSimulator::new()?;
                if let Some(k) = super::action_executor::parse_key(key) {
                    self.guard_raw_input(planned_for, &[]).await?;
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

                if let Some(k) = super::action_executor::parse_key(key) {
                    self.guard_raw_input(planned_for, &[]).await?;
                    keyboard.send_hotkey(&mods, k)?;
                }
            }
            ComputerUseAction::Scroll {
                direction,
                amount,
                at,
            } => {
                let mut mouse = MouseSimulator::new()?;

                // The wheel acts on whatever is under the pointer, so a scroll
                // with no point is judged where the pointer already rests.
                let under_pointer = match at {
                    Some(coord) => {
                        let translated = translate_capture_coordinate(*coord, &primary_display);
                        (translated.x, translated.y)
                    }
                    None => mouse.get_position()?,
                };
                self.guard_raw_input(planned_for, &[under_pointer]).await?;
                if at.is_some() {
                    mouse.move_to(under_pointer.0, under_pointer.1)?;
                }

                let (axis, scroll_amount) =
                    super::action_executor::wheel_motion(*direction, *amount);
                mouse.scroll_along(scroll_amount, axis)?;
            }
            ComputerUseAction::Drag {
                from,
                to,
                duration_ms,
            } => {
                let mut mouse = MouseSimulator::new()?;
                let input_from = translate_capture_coordinate(*from, &primary_display);
                let input_to = translate_capture_coordinate(*to, &primary_display);
                self.guard_raw_input(
                    planned_for,
                    &[(input_from.x, input_from.y), (input_to.x, input_to.y)],
                )
                .await?;
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
                self.guard_raw_input(planned_for, &[(input_x, input_y)])
                    .await?;
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
                    self.wait_for_text(text, Duration::from_millis(*timeout_ms))
                        .await?;
                }
                WaitCondition::ScreenStable {
                    threshold_percent: _,
                    duration_ms,
                } => {
                    if let Err(error) = self
                        .visual_reasoner
                        .wait_for_stable(Duration::from_millis(*duration_ms))
                        .await
                    {
                        stop_on_refused_capture(error)?;
                    }
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
                // The model does not choose where a capture lands: a requested
                // save goes through the shared gate into the private folder.
                if save_path.is_some() {
                    self.visual_reasoner
                        .ensure_front_app_may_be_captured()
                        .await?;
                    super::session::capture_to_disk("screenshot", || {
                        Ok(crate::automation::screen::capture_display(None)?.pixels)
                    })?;
                }
            }
            ComputerUseAction::FocusWindow { title } => {
                self.raise_window(title).await?;
            }
            ComputerUseAction::LaunchApplication { name } => {
                self.ensure_app_may_be_raised(name).await?;
                self.window_coordinator.launch_application(name).await?;
            }
            ComputerUseAction::Copy => {
                let mut keyboard = KeyboardSimulator::new()?;
                self.guard_raw_input(planned_for, &[]).await?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('c'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('c'))?;
            }
            ComputerUseAction::Paste => {
                let mut keyboard = KeyboardSimulator::new()?;
                self.guard_raw_input(planned_for, &[]).await?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('v'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('v'))?;
            }
            ComputerUseAction::SelectAll => {
                let mut keyboard = KeyboardSimulator::new()?;
                self.guard_raw_input(planned_for, &[]).await?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('a'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('a'))?;
            }
            ComputerUseAction::Undo => {
                let mut keyboard = KeyboardSimulator::new()?;
                self.guard_raw_input(planned_for, &[]).await?;
                #[cfg(target_os = "macos")]
                keyboard.send_hotkey(&[enigo::Key::Meta], enigo::Key::Unicode('z'))?;
                #[cfg(not(target_os = "macos"))]
                keyboard.send_hotkey(&[enigo::Key::Control], enigo::Key::Unicode('z'))?;
            }
            ComputerUseAction::Redo => {
                let mut keyboard = KeyboardSimulator::new()?;
                self.guard_raw_input(planned_for, &[]).await?;
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
                self.visual_reasoner
                    .ensure_front_app_may_be_captured()
                    .await?;
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
            ComputerUseAction::ChooseFile { path } => {
                let path = super::control::validate_picker_path(path)?;
                self.send_paced_keystrokes(
                    planned_for,
                    &super::control::file_picker_keystrokes(
                        super::control::FilePickerPlatform::current(),
                        path,
                    ),
                )
                .await?;
            }
            ComputerUseAction::RespondToDialog { response } => {
                self.send_paced_keystrokes(
                    planned_for,
                    &super::control::dialog_keystrokes(*response),
                )
                .await?;
            }
        }

        Ok(())
    }

    /// Waits for text to appear on screen.
    async fn wait_for_text(&self, text: &str, timeout: Duration) -> Result<bool> {
        let start = Instant::now();
        let check_interval = Duration::from_millis(500);

        while start.elapsed() < timeout {
            match self.visual_reasoner.find_text(text).await {
                Ok(Some(_)) => return Ok(true),
                Ok(None) => {}
                Err(error) => stop_on_refused_capture(error)?,
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
    super::control::resolve_primary_display()
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

    #[tokio::test]
    async fn a_cancelled_run_stops_before_its_first_step() {
        let cancellation = CancellationToken::new();
        let agent = ComputerUseAgent::new(
            Arc::new(RwLock::new(LLMRouter::new())),
            ComputerUseConfig::default(),
        )
        .unwrap()
        .with_cancellation(cancellation.clone());
        cancellation.cancel();

        let result = agent
            .execute_task(ComputerUseTask {
                description: "Open the settings window".to_string(),
                ..ComputerUseTask::default()
            })
            .await
            .unwrap();

        assert!(!result.success);
        assert!(matches!(result.reason, CompletionReason::UserCancelled));
        assert_eq!(result.state.actions_executed, 0);
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
