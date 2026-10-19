use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet, VecDeque};
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::automation::computer_use::consent::{
    consent_prompt_on_screen, load_consent, persist_consent, process_scope, revoke_consent,
    ConsentPromptOnScreen, ConsentScope,
};
use crate::automation::computer_use::ComputerUseConsent;
use crate::automation::computer_use::{
    classify_start_apps, describe_app_permission_block, ActiveWindow, AppPermission,
    AppPermissionManager, ComputerUseAgent, ComputerUseConfig, ComputerUseSafetyLayer,
    ComputerUseTask, ExecutionState, PermissionStatus, SafetyConfig, StartCandidate, TargetApp,
    TaskOutcome, ALWAYS_BLOCKED_BUNDLE_IDS,
};
use crate::automation::os_lock::lock_os_automation;
use crate::core::llm::Provider;
use crate::sys::commands::llm::LLMState;
use crate::sys::commands::settings_v2::SettingsServiceState;

pub struct ComputerUseState {
    opa_executions: HashMap<String, OpaExecutionControl>,
    opa_cancelled_before_start: HashSet<String>,
    opa_completed_executions: VecDeque<String>,
}

#[derive(Clone)]
struct OpaExecutionControl {
    cancellation: CancellationToken,
    finished: CancellationToken,
}

impl OpaExecutionControl {
    fn new() -> Self {
        Self {
            cancellation: CancellationToken::new(),
            finished: CancellationToken::new(),
        }
    }
}

impl ComputerUseState {
    pub fn new() -> Self {
        Self {
            opa_executions: HashMap::new(),
            opa_cancelled_before_start: HashSet::new(),
            opa_completed_executions: VecDeque::new(),
        }
    }
}

impl Default for ComputerUseState {
    fn default() -> Self {
        Self::new()
    }
}

const CONSENT_REQUIRED_ERROR: &str = "Computer use has not been consented to on this device. Approve the computer-use request that opens on this computer, then start the action again.";
const CONSENT_PROMPT_BUSY_ERROR: &str = "The computer-use consent request is open on this computer. It has to be answered there, so nothing can be driven through this app until it is.";
const AUTOMATION_NOT_SUSPENDED_ERROR: &str = "Computer use cannot ask for permission right now: this app could not pause its own pointer and keyboard control while the request is open. Try again, or restart AGI Workforce.";
const CONSENT_PROMPT_TITLE: &str = "Allow AGI Workforce to control this computer?";
const CONSENT_PROMPT_BODY: &str = "AGI Workforce is asking to watch this screen and to move the pointer, type, and click on your behalf. The permission lasts until you turn computer use off in Settings or quit AGI Workforce. Allow this only if you just started a computer-use task yourself.";
const CONSENT_PROMPT_ALLOW_LABEL: &str = "Allow";
const CONSENT_PROMPT_COOLDOWN: Duration = Duration::from_secs(30);
const DESKTOP_GATE_UNAVAILABLE_ERROR: &str = "Desktop control is unavailable: its safety checks did not start, so no app can be checked before it is used.";
const SELF_CONTROL_REFUSED_ERROR: &str =
    "AGI Workforce does not click or type into its own window. Name another app to use.";

static CONSENT_PROMPT: Lazy<ConsentPrompt> = Lazy::new(ConsentPrompt::default);

#[derive(Default)]
struct ConsentPrompt {
    state: std::sync::Mutex<PromptState>,
}

#[derive(Default)]
struct PromptState {
    open: bool,
    last_shown: Option<Instant>,
}

/// Keeps the prompt marked open for exactly as long as the dialog is on screen,
/// including when the caller unwinds.
struct PromptTicket<'a> {
    prompt: &'a ConsentPrompt,
    _on_screen: ConsentPromptOnScreen,
}

impl Drop for PromptTicket<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.prompt.state.lock() {
            state.open = false;
        }
    }
}

impl ConsentPrompt {
    /// Reserves the right to raise the dialog, stamping the cooldown as the
    /// dialog is shown rather than when it is answered: a burst of commands
    /// cannot become a wall of dialogs, and failing to record an approval
    /// cannot reopen one on the next `invoke()`.
    fn reserve(&self) -> Option<PromptTicket<'_>> {
        let mut state = self.state.lock().ok()?;
        if state.open {
            return None;
        }
        if state
            .last_shown
            .is_some_and(|shown_at| shown_at.elapsed() < CONSENT_PROMPT_COOLDOWN)
        {
            return None;
        }
        state.open = true;
        state.last_shown = Some(Instant::now());
        Some(PromptTicket {
            prompt: self,
            _on_screen: consent_prompt_on_screen(),
        })
    }

    /// A poisoned lock reads as open so synthetic input stays refused.
    fn is_open(&self) -> bool {
        self.state.lock().map(|state| state.open).unwrap_or(true)
    }
}

/// The consent screen is a product precondition for any
/// computer-use action, but it was enforced only by a renderer-side Zustand
/// flag, so anything that could reach `invoke()` could take over the desktop.
///
/// Three properties make the gate hold against that caller. The stored grant is
/// sealed under the per-install secret and a per-process scope secret, so the
/// row a renderer can write through `settings_v2_set` is not consent and a row
/// it copied out of `settings_v2_get` stops verifying once consent is revoked.
/// A grant is minted only by the native prompt below, which is answered on the
/// desktop rather than in the webview, and while that prompt is on screen the
/// whole process is barred from synthesizing input at it: commands refuse
/// through this gate, and everything else, the agent loops and the LLM UI
/// tools, stalls on the OS-automation lock the prompt holds.
pub(crate) async fn require_consent(
    app_handle: &tauri::AppHandle,
    settings: &SettingsServiceState,
) -> Result<(), String> {
    let app_handle = app_handle.clone();
    require_consent_via(process_scope(), settings, &CONSENT_PROMPT, move || {
        native_consent_prompt(app_handle)
    })
    .await
}

/// The chat `ui_*` tools act outside an observe-plan-act run, so each action
/// passes the gates a run step passes: device consent, the user's takeover, a
/// run that already owns the desktop, and the per-app registry with its
/// refuse-list, judged against the app the action is aimed at. `run_id` is the
/// observe-plan-act run a routed step belongs to, which owns the desktop
/// already and so is not refused as a second owner.
pub(crate) async fn authorize_desktop_action(
    app_handle: &tauri::AppHandle,
    target: &TargetApp,
    run_id: Option<&str>,
) -> Result<(), String> {
    use tauri::Manager as _;

    let settings = app_handle
        .try_state::<SettingsServiceState>()
        .ok_or_else(|| CONSENT_REQUIRED_ERROR.to_string())?;
    require_consent(app_handle, settings.inner()).await?;

    crate::automation::computer_use::control::ensure_agent_in_control()
        .map_err(|e| e.to_string())?;

    let runs = app_handle
        .try_state::<Arc<Mutex<ComputerUseState>>>()
        .ok_or_else(|| DESKTOP_GATE_UNAVAILABLE_ERROR.to_string())?;
    if let Some(active) = runs
        .lock()
        .await
        .opa_executions
        .keys()
        .find(|active| Some(active.as_str()) != run_id)
    {
        return Err(format!(
            "computer-use execution '{active}' already owns desktop control"
        ));
    }

    refuse_app(app_handle, target).await
}

/// Judges the app found in front immediately before input is sent, so an app
/// that took focus after the target was brought forward is caught.
pub(crate) async fn confirm_target_in_front(
    app_handle: &tauri::AppHandle,
    target: &TargetApp,
    front: Option<TargetApp>,
) -> Result<(), String> {
    crate::automation::computer_use::control::ensure_agent_in_control()
        .map_err(|e| e.to_string())?;
    let front = target_still_in_front(target, front)?;
    refuse_app(app_handle, &front).await
}

fn target_still_in_front(
    target: &TargetApp,
    front: Option<TargetApp>,
) -> Result<TargetApp, String> {
    match front {
        Some(front) if front.pid == target.pid => Ok(front),
        _ => Err(format!(
            "'{}' is no longer the app in front, so nothing was clicked or typed.",
            target.name
        )),
    }
}

/// Judges an app that is not running, or is known only by a name: the
/// refuse-list and the per-app registry by name. An app nobody approved is
/// refused, so a run cannot launch or raise one to get it on screen.
pub(crate) async fn refuse_app_named(
    app_handle: &tauri::AppHandle,
    app_name: &str,
) -> Result<(), String> {
    use tauri::Manager as _;

    let permissions = app_handle
        .try_state::<Arc<AppPermissionManager>>()
        .ok_or_else(|| DESKTOP_GATE_UNAVAILABLE_ERROR.to_string())?;
    refuse_app_window(
        permissions.inner().clone(),
        Some(ActiveWindow {
            app_name: app_name.to_string(),
            window_title: String::new(),
            bundle_id: None,
        }),
        &app_handle.config().identifier,
    )
    .await
}

/// Whether `app` is this app, by process or by bundle id.
pub(crate) fn is_own_app(app_handle: &tauri::AppHandle, app: &TargetApp) -> bool {
    u32::try_from(app.pid).ok() == Some(std::process::id())
        || app.bundle_id.as_deref() == Some(app_handle.config().identifier.as_str())
}

/// The running apps a run could start in, for the first step planned without
/// a screenshot.
pub(crate) async fn start_candidates(
    app_handle: &tauri::AppHandle,
    running: Vec<TargetApp>,
) -> Result<Vec<StartCandidate>, String> {
    use tauri::Manager as _;

    let permissions = app_handle
        .try_state::<Arc<AppPermissionManager>>()
        .ok_or_else(|| DESKTOP_GATE_UNAVAILABLE_ERROR.to_string())?;
    Ok(classify_start_apps(permissions.inner(), running, |app| {
        is_own_app(app_handle, app)
    })
    .await)
}

pub(crate) async fn refuse_app(
    app_handle: &tauri::AppHandle,
    app: &TargetApp,
) -> Result<(), String> {
    use tauri::Manager as _;

    if is_own_app(app_handle, app) {
        return Err(SELF_CONTROL_REFUSED_ERROR.to_string());
    }
    let permissions = app_handle
        .try_state::<Arc<AppPermissionManager>>()
        .ok_or_else(|| DESKTOP_GATE_UNAVAILABLE_ERROR.to_string())?;
    refuse_app_window(
        permissions.inner().clone(),
        Some(app.as_active_window()),
        &app_handle.config().identifier,
    )
    .await
}

async fn refuse_app_window(
    permissions: Arc<AppPermissionManager>,
    window: Option<ActiveWindow>,
    own_bundle_id: &str,
) -> Result<(), String> {
    if window
        .as_ref()
        .and_then(|window| window.bundle_id.as_deref())
        .is_some_and(|bundle_id| bundle_id == own_bundle_id)
    {
        return Err(SELF_CONTROL_REFUSED_ERROR.to_string());
    }
    let gate = ComputerUseSafetyLayer::with_app_permissions(SafetyConfig::default(), permissions);
    match gate.check_foreground_app(window).await {
        None => Ok(()),
        Some(reason) => Err(describe_app_permission_block(&reason)),
    }
}

async fn require_consent_via<P, F>(
    scope: &ConsentScope,
    settings: &SettingsServiceState,
    prompt_gate: &ConsentPrompt,
    prompt: P,
) -> Result<(), String>
where
    P: FnOnce() -> F,
    F: Future<Output = bool>,
{
    refuse_while_prompt_is_open(prompt_gate)?;
    if consent_granted(scope, settings)? {
        return Ok(());
    }

    // The dialog wait is unbounded, so the reservation is a flag rather than a
    // held lock: a pending prompt must not stall every other command.
    let Some(_ticket) = prompt_gate.reserve() else {
        return Err(CONSENT_REQUIRED_ERROR.to_string());
    };
    if consent_granted(scope, settings)? {
        return Ok(());
    }

    let approved = {
        let _suspension = suspend_os_automation().await?;
        prompt().await
    };
    if !approved {
        let _ = clear_consent(scope, settings);
        return Err(CONSENT_REQUIRED_ERROR.to_string());
    }

    write_consent(scope, settings, &ComputerUseConsent::accept())
}

/// Refusing synthetic input command by
/// command only holds while every emitter is a command. The autonomous agent
/// loop and the LLM UI tools both reach `MouseSimulator` without one, so the
/// prompt instead takes the process-wide OS-automation lock
/// that every synthetic click, keystroke, clipboard write and screen capture in
/// this process has to take. While the user is deciding there is no thread left
/// that can press the dialog's buttons, and none that can photograph where they
/// are.
///
/// The lock is parked on its own thread rather than held by the caller: the
/// dialog wait is unbounded and the guard is neither `Send` nor safe to hold
/// across an await.
struct SuspendedOsAutomation {
    release: Option<std::sync::mpsc::Sender<()>>,
    holder: Option<std::thread::JoinHandle<()>>,
}

impl SuspendedOsAutomation {
    fn begin() -> Result<Self, String> {
        let (held_tx, held_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let holder = std::thread::spawn(move || {
            let held = lock_os_automation();
            if held_tx.send(held.is_ok()).is_err() || held.is_err() {
                return;
            }
            let _ = release_rx.recv();
        });

        match held_rx.recv() {
            Ok(true) => Ok(Self {
                release: Some(release_tx),
                holder: Some(holder),
            }),
            _ => Err(AUTOMATION_NOT_SUSPENDED_ERROR.to_string()),
        }
    }
}

impl Drop for SuspendedOsAutomation {
    fn drop(&mut self) {
        self.release = None;
        if let Some(holder) = self.holder.take() {
            let _ = holder.join();
        }
    }
}

async fn suspend_os_automation() -> Result<SuspendedOsAutomation, String> {
    tokio::task::spawn_blocking(SuspendedOsAutomation::begin)
        .await
        .unwrap_or_else(|_| Err(AUTOMATION_NOT_SUSPENDED_ERROR.to_string()))
}

fn refuse_while_prompt_is_open(prompt_gate: &ConsentPrompt) -> Result<(), String> {
    if prompt_gate.is_open() {
        return Err(CONSENT_PROMPT_BUSY_ERROR.to_string());
    }
    Ok(())
}

async fn native_consent_prompt(app_handle: tauri::AppHandle) -> bool {
    crate::sys::native_confirm::confirm(
        &app_handle,
        crate::sys::native_confirm::NativeConfirm {
            title: CONSENT_PROMPT_TITLE.to_string(),
            body: CONSENT_PROMPT_BODY.to_string(),
            confirm_label: CONSENT_PROMPT_ALLOW_LABEL.to_string(),
        },
    )
    .await
}

fn consent_granted(scope: &ConsentScope, settings: &SettingsServiceState) -> Result<bool, String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to read computer-use consent: {e}"))?;
    Ok(load_consent(scope, &service).is_valid())
}

fn write_consent(
    scope: &ConsentScope,
    settings: &SettingsServiceState,
    consent: &ComputerUseConsent,
) -> Result<(), String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to record computer-use consent: {e}"))?;
    persist_consent(scope, &service, consent)
        .map_err(|e| format!("Failed to record computer-use consent: {e}"))
}

fn clear_consent(scope: &ConsentScope, settings: &SettingsServiceState) -> Result<(), String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to clear computer-use consent: {e}"))?;
    revoke_consent(scope, &service)
        .map_err(|e| format!("Failed to clear computer-use consent: {e}"))
}

/// TRUST BOUNDARY (desktop-trust-boundary-01): rejects OPA submissions whose
/// declared execution boundary contradicts the provider they name, the same
/// coherence validation the chat layer applies in
/// `sys/commands/chat/types.rs` (`ChatSendMessageRequest::validate`).
///
/// Absent `execution_mode` stays fail-closed Local in the router; absent
/// `provider` lets the router pick within the declared boundary, both pass.
/// `CloudManaged` + a direct vendor provider string is deliberately allowed:
/// it is a model-family hint from the managed-mode picker, and the router's
/// `ManagedCloud` trust filter only admits managed-cloud candidates, so the
/// hint can never cause direct vendor egress.
fn validate_opa_execution_boundary(
    execution_mode: Option<crate::sys::commands::chat::types::ChatExecutionMode>,
    provider: Option<Provider>,
) -> Result<(), String> {
    use crate::sys::commands::chat::types::ChatExecutionMode;

    let (Some(mode), Some(provider)) = (execution_mode, provider) else {
        return Ok(());
    };
    let is_local = matches!(
        provider,
        Provider::Ollama | Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
    );
    match mode {
        ChatExecutionMode::LocalOnly if !is_local => Err(format!(
            "execution_mode 'local_only' cannot use non-local provider '{}'; omit the provider or fork the task to BYOK",
            provider.as_string()
        )),
        ChatExecutionMode::Byok if is_local || provider == Provider::ManagedCloud => Err(format!(
            "execution_mode 'byok' requires a direct vendor provider, got '{}'",
            provider.as_string()
        )),
        ChatExecutionMode::CloudManaged if is_local => Err(format!(
            "execution_mode 'cloud_managed' cannot run on local provider '{}'",
            provider.as_string()
        )),
        _ => Ok(()),
    }
}

const OPA_CANCELLATION_ACK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_OPA_PRE_CANCELLED_EXECUTIONS: usize = 128;
// Bound replay memory in the long-lived native process. UUID entropy remains the
// primary uniqueness guarantee once an old completion ages out of this cache.
const MAX_OPA_COMPLETED_EXECUTIONS: usize = 256;

enum OpaExecutionRegistration {
    Active(OpaExecutionControl),
    CancelledBeforeStart,
}

fn validate_opa_execution_id(execution_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(execution_id)
        .map(|_| ())
        .map_err(|_| "computer-use execution_id must be a UUID".to_string())
}

fn remember_completed_opa_execution(state: &mut ComputerUseState, execution_id: &str) {
    if state
        .opa_completed_executions
        .iter()
        .any(|completed| completed == execution_id)
    {
        return;
    }
    if state.opa_completed_executions.len() >= MAX_OPA_COMPLETED_EXECUTIONS {
        state.opa_completed_executions.pop_front();
    }
    state
        .opa_completed_executions
        .push_back(execution_id.to_string());
}

async fn register_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
) -> Result<OpaExecutionRegistration, String> {
    validate_opa_execution_id(execution_id)?;
    let mut computer_state = state.lock().await;
    if computer_state
        .opa_completed_executions
        .iter()
        .any(|completed| completed == execution_id)
    {
        return Err(format!(
            "computer-use execution '{execution_id}' has already completed and cannot be reused"
        ));
    }
    if computer_state
        .opa_cancelled_before_start
        .remove(execution_id)
    {
        remember_completed_opa_execution(&mut computer_state, execution_id);
        return Ok(OpaExecutionRegistration::CancelledBeforeStart);
    }
    if computer_state.opa_executions.contains_key(execution_id) {
        return Err(format!(
            "computer-use execution '{execution_id}' is already active"
        ));
    }
    if let Some(active_execution_id) = computer_state.opa_executions.keys().next() {
        return Err(format!(
            "computer-use execution '{active_execution_id}' already owns desktop control"
        ));
    }

    let control = OpaExecutionControl::new();
    computer_state
        .opa_executions
        .insert(execution_id.to_string(), control.clone());
    Ok(OpaExecutionRegistration::Active(control))
}

async fn finish_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
    control: &OpaExecutionControl,
) {
    let mut computer_state = state.lock().await;
    computer_state.opa_executions.remove(execution_id);
    remember_completed_opa_execution(&mut computer_state, execution_id);
    control.finished.cancel();
}

async fn cancel_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
) -> Result<bool, String> {
    validate_opa_execution_id(execution_id)?;
    let control = {
        let mut computer_state = state.lock().await;
        let control = computer_state.opa_executions.get(execution_id).cloned();
        if control.is_none() {
            if computer_state
                .opa_completed_executions
                .iter()
                .any(|completed| completed == execution_id)
            {
                return Ok(true);
            }
            if computer_state
                .opa_cancelled_before_start
                .contains(execution_id)
            {
                return Ok(true);
            }
            if computer_state.opa_cancelled_before_start.len() >= MAX_OPA_PRE_CANCELLED_EXECUTIONS {
                return Err(
                    "too many computer-use executions are awaiting start cancellation".to_string(),
                );
            }
            // Tauri dispatches async commands independently. Stop can therefore
            // arrive before the earlier execute invoke registers. Reserve this
            // UUID as revoked so a late execute consumes the reservation and
            // returns a cancelled result without taking any OS action.
            computer_state
                .opa_cancelled_before_start
                .insert(execution_id.to_string());
            return Ok(true);
        }
        control
    };
    let control = control.expect("active execution control checked while holding the state lock");

    control.cancellation.cancel();
    tokio::time::timeout(OPA_CANCELLATION_ACK_TIMEOUT, control.finished.cancelled())
        .await
        .map_err(|_| {
            format!("timed out waiting for computer-use execution '{execution_id}' to stop")
        })?;
    Ok(true)
}

async fn await_opa_or_cancellation<T>(
    cancellation: &CancellationToken,
    execution: impl Future<Output = T>,
) -> Option<T> {
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => None,
        result = execution => Some(result),
    }
}

fn cancelled_opa_result() -> serde_json::Value {
    serde_json::json!({
        "success": false,
        "reason": { "type": "user_cancelled" },
        "state": ExecutionState::default(),
        "outcome": TaskOutcome::failure(
            0,
            0,
            "Computer-use action was cancelled.".to_string(),
            Vec::new(),
        ),
    })
}

/// Executes an OPA (Observe-Plan-Act) computer use task.
///
/// Stream 2 params:
/// - `model`: explicit vision-capable model id from the catalog. `None` lets the
///   router pick the user's default vision model.
/// - `provider`: explicit provider name (`anthropic`, `openai`, `google`,
///   `xai`, etc). `None` resolves from the model id.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn computer_use_execute_opa_task(
    execution_id: String,
    description: String,
    timeout_ms: Option<u64>,
    max_actions: Option<u32>,
    target_application: Option<String>,
    success_indicators: Option<Vec<String>>,
    model: Option<String>,
    provider: Option<String>,
    // TRUST BOUNDARY (desktop-trust-boundary-01): the active session's
    // execution boundary. Optional so existing callers keep compiling; when
    // omitted the router's fail-closed default keeps this Local-only rather
    // than silently reaching whatever `provider` above names.
    execution_mode: Option<crate::sys::commands::chat::types::ChatExecutionMode>,
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    llm_state: State<'_, LLMState>,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
    settings: State<'_, SettingsServiceState>,
) -> Result<serde_json::Value, String> {
    if let Some(off) =
        crate::sys::commands::capabilities::capability_refusal(&app_handle, "computer_use").await
    {
        return Err(off);
    }
    require_consent(&app_handle, &settings).await?;
    crate::ui::hooks::gate_user_prompt("computer-use", &description).await?;

    let router = llm_state.router.clone();

    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(300_000));
    let iterations = max_actions.unwrap_or(100);

    let resolved_provider = provider.as_deref().and_then(Provider::from_string);

    validate_opa_execution_boundary(execution_mode, resolved_provider)?;

    let config = ComputerUseConfig {
        max_iterations: iterations,
        max_duration: timeout_duration,
        model,
        provider: resolved_provider,
        trust_mode: execution_mode.map(|mode| mode.trust_mode()),
        ..ComputerUseConfig::default()
    };

    // Stream 1: wire the per-app permission manager into the agent so the
    // safety layer's `check_app_permission` consults the active foreground
    // app on every action. Closes the gap from today's audit.
    let agent =
        ComputerUseAgent::with_app_permissions(router, config, permissions_state.inner().clone())
            .map_err(|e| format!("Failed to create ComputerUseAgent: {}", e))?
            .with_app_handle(app_handle);

    let task = ComputerUseTask {
        id: execution_id.clone(),
        description,
        timeout_ms: timeout_ms.unwrap_or(300_000),
        max_actions: max_actions.unwrap_or(100),
        target_application,
        success_indicators: success_indicators.unwrap_or_default(),
        ..ComputerUseTask::default()
    };

    let control = match register_opa_execution(state.inner(), &execution_id).await? {
        OpaExecutionRegistration::Active(control) => control,
        OpaExecutionRegistration::CancelledBeforeStart => {
            return Ok(cancelled_opa_result());
        }
    };
    let agent = agent.with_cancellation(control.cancellation.clone());
    let result = await_opa_or_cancellation(&control.cancellation, agent.execute_task(task)).await;
    finish_opa_execution(state.inner(), &execution_id, &control).await;

    let Some(result) = result else {
        return Ok(cancelled_opa_result());
    };
    let result = result.map_err(|e| format!("OPA task execution failed: {}", e))?;

    let value = serde_json::json!({
        "success": result.success,
        "reason": result.reason,
        "state": result.state,
        "outcome": result.outcome,
    });

    Ok(value)
}

/// Cancels one exact OPA execution and does not acknowledge until the native
/// execution future has been dropped. The UUID is the caller's ownership
/// handle; stale UI sessions cannot cancel a newer run by using ambient state.
#[tauri::command]
pub async fn computer_use_cancel_opa_task(
    execution_id: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<bool, String> {
    cancel_opa_execution(state.inner(), &execution_id).await
}

// ---------------------------------------------------------------------------
// Per-app permissions (Stream 1)
// ---------------------------------------------------------------------------

/// Lists every app the user has explicitly allowed/denied/marked-ask.
/// Apps not in this list default to `AskEveryTime` on first encounter.
#[tauri::command]
pub async fn app_permissions_list(
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<Vec<AppPermission>, String> {
    Ok(permissions_state.list_permissions().await)
}

/// Letting an app be used, or lifting a block on one, is decided by the user
/// in a dialog the operating system draws. The settings page renders model
/// output, and a script in it could otherwise allow any app it named.
const ALLOW_APP_CONFIRM_LABEL: &str = "Allow App";
const UNBLOCK_APP_CONFIRM_LABEL: &str = "Stop Blocking";
const APP_PERMISSION_DECLINED_MESSAGE: &str =
    "The change was not confirmed, so the app's permission is as it was.";
const APP_ALWAYS_BLOCKED_MESSAGE: &str =
    "This app is on the list computer use never touches, so its permission cannot be loosened.";
const APP_NOT_SHOWN_WHOLE_MESSAGE: &str =
    "This app's name or identifier cannot be shown in full, so its permission cannot be loosened.";
const NO_APP_IDENTIFIER: &str = "none reported";
const MAX_SHOWN_APP_TEXT_CHARS: usize = 120;

/// One app-permission question at a time, and a wait after a no that grows
/// while the noes keep coming.
static APP_PERMISSION_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

/// The app a looser permission would be for.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PermissionSubject {
    name: String,
    bundle_id: Option<String>,
}

/// Who a looser permission is for, from what this process can see rather
/// than from what the window sent. Where running apps can be listed the app
/// has to be running, and its own name and bundle id replace the ones
/// supplied, so a request cannot pair one app's name with another's
/// identifier. Elsewhere there is no list to check against: the supplied name
/// and identifier are used as they are, and the dialog shows both.
fn permission_subject(
    app_name: &str,
    bundle_id: Option<&str>,
) -> Result<PermissionSubject, String> {
    if cfg!(target_os = "macos") {
        let app =
            crate::automation::computer_use::resolve_target_app(bundle_id.unwrap_or(app_name))?;
        return Ok(PermissionSubject {
            name: app.name,
            bundle_id: app.bundle_id,
        });
    }
    Ok(PermissionSubject {
        name: app_name.to_string(),
        bundle_id: bundle_id.map(String::from),
    })
}

fn shown_app_text(text: &str) -> Option<String> {
    let shown = crate::sys::native_confirm::shown_value(text);
    (shown.chars().count() <= MAX_SHOWN_APP_TEXT_CHARS).then_some(shown)
}

/// The question for a looser permission. An app is allowed only under a name
/// and identifier the dialog shows exactly as they are stored; lifting a
/// block may show them with their hidden characters marked, since the stored
/// entry is what is being removed.
fn looser_permission_question(
    subject: &PermissionSubject,
    requested: PermissionStatus,
) -> Result<crate::sys::native_confirm::NativeConfirm, String> {
    let name = shown_app_text(&subject.name);
    let identifier = match subject.bundle_id.as_deref() {
        Some(bundle_id) => shown_app_text(bundle_id),
        None => Some(NO_APP_IDENTIFIER.to_string()),
    };
    let (Some(name), Some(identifier)) = (name, identifier) else {
        return Err(APP_NOT_SHOWN_WHOLE_MESSAGE.to_string());
    };

    if requested == PermissionStatus::Allowed {
        let marked = name != subject.name
            || subject
                .bundle_id
                .as_deref()
                .is_some_and(|bundle_id| identifier != bundle_id);
        if marked {
            return Err(APP_NOT_SHOWN_WHOLE_MESSAGE.to_string());
        }
        return Ok(crate::sys::native_confirm::NativeConfirm {
            title: "Allow computer control of this app?".to_string(),
            body: format!(
                "AGI Workforce will be able to watch \"{name}\" and to click and type in it during computer-use tasks, without asking again.\n\nApp: {name}\nIdentifier: {identifier}\n\nYou can change this in Settings, under Computer Use."
            ),
            confirm_label: ALLOW_APP_CONFIRM_LABEL.to_string(),
        });
    }

    Ok(crate::sys::native_confirm::NativeConfirm {
        title: "Stop blocking this app?".to_string(),
        body: format!(
            "\"{name}\" is blocked for computer use. Without the block it still cannot be used until you allow it, but it is no longer refused outright.\n\nApp: {name}\nIdentifier: {identifier}"
        ),
        confirm_label: UNBLOCK_APP_CONFIRM_LABEL.to_string(),
    })
}

/// Asks, unless the app already has this much latitude under the name and
/// identifier this process found for it.
async fn confirm_looser_permission(
    app_handle: &tauri::AppHandle,
    permissions: &AppPermissionManager,
    subject: &PermissionSubject,
    requested: PermissionStatus,
) -> Result<(), String> {
    use crate::automation::computer_use::is_always_blocked_bundle;

    if is_always_blocked_bundle(&subject.name)
        || subject
            .bundle_id
            .as_deref()
            .is_some_and(is_always_blocked_bundle)
    {
        return Err(APP_ALWAYS_BLOCKED_MESSAGE.to_string());
    }
    if !permissions
        .loosens(&subject.name, subject.bundle_id.as_deref(), requested)
        .await
    {
        return Ok(());
    }

    let question = looser_permission_question(subject, requested)?;
    let request = format!(
        "{requested:?}\n{}\n{}",
        subject.name,
        subject.bundle_id.as_deref().unwrap_or_default()
    );
    let confirmed = APP_PERMISSION_DECISIONS
        .confirm(app_handle, &request, question)
        .await
        .map_err(|held| held.message())?;
    if confirmed {
        Ok(())
    } else {
        Err(APP_PERMISSION_DECLINED_MESSAGE.to_string())
    }
}

/// Sets the permission status for an app (allow / deny / ask).
///
/// `status` accepts: `allowed`, `denied`, or `ask`. A change that lets the
/// app be used more than it can be now is confirmed in a native dialog that
/// names the app; one that restricts it is stored as sent.
#[tauri::command]
pub async fn app_permissions_set(
    app_name: String,
    bundle_id: Option<String>,
    status: String,
    app_handle: tauri::AppHandle,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<(), String> {
    let requested = match status.to_lowercase().as_str() {
        "allowed" | "allow" => PermissionStatus::Allowed,
        "denied" | "deny" | "block" | "blocked" => PermissionStatus::Denied,
        "ask" | "ask_every_time" | "askeverytime" => PermissionStatus::AskEveryTime,
        other => {
            return Err(format!(
                "Invalid status '{other}'. Expected one of: allowed, denied, ask"
            ))
        }
    };

    let permissions = permissions_state.inner();
    let given_bundle_id = bundle_id
        .as_deref()
        .map(str::trim)
        .filter(|bundle_id| !bundle_id.is_empty());
    let subject = if permissions
        .loosens(&app_name, given_bundle_id, requested)
        .await
    {
        let subject = permission_subject(&app_name, given_bundle_id)?;
        confirm_looser_permission(&app_handle, permissions, &subject, requested).await?;
        subject
    } else {
        PermissionSubject {
            bundle_id: given_bundle_id.map(String::from),
            name: app_name,
        }
    };

    permissions
        .set_permission_with_bundle(&subject.name, subject.bundle_id.as_deref(), requested)
        .await;
    persist_permissions(&app_handle, permissions).await;
    Ok(())
}

/// Removes a per-app permission entry, reverting it to `AskEveryTime` on
/// next encounter. Removing a block is a looser permission and is confirmed
/// in a native dialog; removing anything else is not.
#[tauri::command]
pub async fn app_permissions_remove(
    app_name: String,
    app_handle: tauri::AppHandle,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<(), String> {
    let permissions = permissions_state.inner();
    let blocked = permissions
        .entry(&app_name)
        .await
        .filter(|entry| entry.status == PermissionStatus::Denied);
    if let Some(blocked) = blocked {
        let subject = PermissionSubject {
            name: blocked.app_name,
            bundle_id: blocked.bundle_id,
        };
        let question = looser_permission_question(&subject, PermissionStatus::AskEveryTime)?;
        let confirmed = APP_PERMISSION_DECISIONS
            .confirm(&app_handle, &format!("remove\n{}", subject.name), question)
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(APP_PERMISSION_DECLINED_MESSAGE.to_string());
        }
    }

    permissions.remove_permission(&app_name).await;
    persist_permissions(&app_handle, permissions).await;
    Ok(())
}

/// Best-effort persistence of the permission registry to the app data dir.
/// Failures are logged but don't bubble up, the in-memory state is still
/// authoritative for the current session.
async fn persist_permissions(app_handle: &tauri::AppHandle, mgr: &Arc<AppPermissionManager>) {
    use tauri::Manager as _;
    let path = match app_handle.path().app_data_dir() {
        Ok(dir) => dir.join("app_permissions.json"),
        Err(e) => {
            tracing::warn!(
                "Could not resolve app_data_dir for app_permissions.json: {}",
                e
            );
            return;
        }
    };

    match mgr.to_json().await {
        Ok(json) => {
            if let Err(e) = tokio::fs::write(&path, json).await {
                tracing::warn!(
                    "Failed to persist app_permissions.json at {:?}: {}",
                    path,
                    e
                );
            }
        }
        Err(e) => {
            tracing::warn!("Failed to serialize app_permissions: {}", e);
        }
    }
}

/// Returns the hardcoded refuse-list (investment / crypto / banking
/// apps) so the UI can surface them as "always blocked" entries that the
/// user cannot enable.
#[tauri::command]
pub fn app_permissions_always_blocked() -> Vec<String> {
    ALWAYS_BLOCKED_BUNDLE_IDS
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Returns the currently focused application, used by the settings UI to
/// help the user discover and approve new apps.
#[tauri::command]
pub fn app_permissions_active_window() -> Option<crate::automation::computer_use::ActiveWindow> {
    crate::automation::computer_use::WindowCoordinator::get_active_window()
}

#[tauri::command]
pub fn computer_use_take_over() -> crate::automation::computer_use::ControlState {
    tracing::info!("User took over screen control from the agent");
    crate::automation::computer_use::control::take_over()
}

const HAND_BACK_CONFIRM_LABEL: &str = "Hand Back";
const HAND_BACK_REQUEST: &str = "hand-back";
const HAND_BACK_DECLINED_MESSAGE: &str =
    "Handing control back was not confirmed, so the screen is still yours.";

/// One hand-back question at a time, and a wait after a no that grows while
/// the noes keep coming.
static HAND_BACK_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

fn hand_back_question() -> crate::sys::native_confirm::NativeConfirm {
    crate::sys::native_confirm::NativeConfirm {
        title: "Hand screen control back to AGI Workforce?".to_string(),
        body: "You took over the screen, so nothing can move the pointer or type. Handing control back lets computer-use tasks click and type again in the apps you allowed.".to_string(),
        confirm_label: HAND_BACK_CONFIRM_LABEL.to_string(),
    }
}

/// Resuming control after the user took over is the user's decision alone. A
/// click on "Hand back" in the window reaches this command exactly as a
/// script calling it would, and nothing here can tell the two apart, so the
/// yes is taken in a native dialog. Nothing is asked when the screen was
/// never taken over, because nothing changes.
#[tauri::command]
pub async fn computer_use_hand_back(
    app_handle: tauri::AppHandle,
) -> Result<crate::automation::computer_use::ControlState, String> {
    use crate::automation::computer_use::control;

    if !control::is_taken_over() {
        return Ok(control::control_state());
    }
    let confirmed = HAND_BACK_DECISIONS
        .confirm(&app_handle, HAND_BACK_REQUEST, hand_back_question())
        .await
        .map_err(|held| held.message())?;
    if !confirmed {
        return Err(HAND_BACK_DECLINED_MESSAGE.to_string());
    }
    tracing::info!("User handed screen control back to the agent");
    Ok(control::hand_back())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::computer_use::{CONSENT_SETTINGS_KEY, CONSENT_VERSION};
    use crate::data::settings::{SettingCategory, SettingValue, SettingsService};
    use crate::sys::commands::chat::types::ChatExecutionMode;
    use rusqlite::Connection;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    fn subject(name: &str, bundle_id: Option<&str>) -> PermissionSubject {
        PermissionSubject {
            name: name.to_string(),
            bundle_id: bundle_id.map(String::from),
        }
    }

    #[test]
    fn the_app_permission_and_hand_back_buttons_are_ones_the_native_dialog_can_ask_with() {
        for label in [
            ALLOW_APP_CONFIRM_LABEL,
            UNBLOCK_APP_CONFIRM_LABEL,
            HAND_BACK_CONFIRM_LABEL,
        ] {
            assert!(crate::sys::native_confirm::can_ask_with(label), "{label}");
        }
        assert_eq!(hand_back_question().confirm_label, HAND_BACK_CONFIRM_LABEL);
    }

    #[test]
    fn the_question_for_allowing_an_app_names_it_and_its_identifier() {
        let question = looser_permission_question(
            &subject("Notes", Some("com.apple.Notes")),
            PermissionStatus::Allowed,
        )
        .expect("a question for an app that can be shown");

        assert_eq!(question.confirm_label, ALLOW_APP_CONFIRM_LABEL);
        assert!(question.body.contains("App: Notes"), "{}", question.body);
        assert!(
            question.body.contains("Identifier: com.apple.Notes"),
            "{}",
            question.body
        );
    }

    #[test]
    fn an_app_whose_name_or_identifier_hides_part_of_itself_cannot_be_allowed() {
        let too_long = "N".repeat(MAX_SHOWN_APP_TEXT_CHARS + 1);
        for name in [
            "Notes\u{200B}",
            "Notes\nIdentifier: com.apple.Notes",
            "",
            too_long.as_str(),
        ] {
            assert_eq!(
                looser_permission_question(&subject(name, None), PermissionStatus::Allowed)
                    .unwrap_err(),
                APP_NOT_SHOWN_WHOLE_MESSAGE,
                "{name:?}"
            );
        }
        assert_eq!(
            looser_permission_question(
                &subject("Notes", Some("com.apple.Notes\u{202E}")),
                PermissionStatus::Allowed
            )
            .unwrap_err(),
            APP_NOT_SHOWN_WHOLE_MESSAGE
        );
    }

    #[test]
    fn lifting_a_block_shows_the_stored_entry_with_its_hidden_characters_marked() {
        let question = looser_permission_question(
            &subject("Notes\u{200B}", None),
            PermissionStatus::AskEveryTime,
        )
        .expect("a stored block can always be named");

        assert_eq!(question.confirm_label, UNBLOCK_APP_CONFIRM_LABEL);
        assert!(
            question.body.contains("App: Notes\u{FFFD}"),
            "{}",
            question.body
        );
        assert!(
            question.body.contains("Identifier: none reported"),
            "{}",
            question.body
        );
    }

    /// The window cannot be trusted to have asked: each of these commands
    /// takes the user's yes itself, before the change it guards.
    #[test]
    fn a_looser_app_permission_and_a_hand_back_are_confirmed_before_they_take_effect() {
        let source = include_str!("computer_use.rs");
        let body_of = |signature: &str| {
            source
                .split(signature)
                .nth(1)
                .and_then(|rest| rest.split("\n}\n").next())
                .unwrap_or_else(|| panic!("{signature} is missing"))
        };

        let set = body_of("pub async fn app_permissions_set(");
        assert!(
            set.find("confirm_looser_permission(").expect("set asks")
                < set
                    .find(".set_permission_with_bundle(")
                    .expect("set stores")
        );
        let remove = body_of("pub async fn app_permissions_remove(");
        assert!(
            remove
                .find("APP_PERMISSION_DECISIONS")
                .expect("remove asks")
                < remove.find(".remove_permission(").expect("remove removes")
        );
        let hand_back = body_of("pub async fn computer_use_hand_back(");
        assert!(
            hand_back
                .find("HAND_BACK_DECISIONS")
                .expect("hand-back asks")
                < hand_back
                    .find("control::hand_back()")
                    .expect("hand-back resumes")
        );
    }

    #[test]
    fn the_allow_button_is_one_the_native_dialog_can_ask_with() {
        assert!(crate::sys::native_confirm::can_ask_with(
            CONSENT_PROMPT_ALLOW_LABEL
        ));
    }

    fn settings_state() -> SettingsServiceState {
        let conn = Connection::open_in_memory().expect("in-memory settings database");
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .expect("create settings table");
        SettingsServiceState::new(
            SettingsService::new(Arc::new(std::sync::Mutex::new(conn))).expect("settings service"),
        )
    }

    fn counting_prompt(
        answer: bool,
        calls: &Arc<AtomicUsize>,
    ) -> impl FnOnce() -> std::future::Ready<bool> {
        let calls = calls.clone();
        move || {
            calls.fetch_add(1, Ordering::SeqCst);
            std::future::ready(answer)
        }
    }

    fn fixed_prompt(answer: bool) -> impl FnOnce() -> std::future::Ready<bool> {
        move || std::future::ready(answer)
    }

    fn first_statement_of(source: &str, signature: &str) -> String {
        let after = source
            .split(signature)
            .nth(1)
            .unwrap_or_else(|| panic!("{signature} is missing from this file"));
        let (_, body) = after
            .split_once("> {\n")
            .unwrap_or_else(|| panic!("{signature} has no recognizable body"));
        body.trim_start()
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    #[tokio::test]
    async fn desktop_control_is_refused_until_the_native_prompt_is_approved() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let refusal =
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("unconsented desktop control");
        assert_eq!(refusal, CONSENT_REQUIRED_ERROR);

        // A fresh gate stands in for asking again after the cooldown.
        let gate = ConsentPrompt::default();
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts)).await,
            Ok(())
        );
        assert_eq!(prompts.load(Ordering::SeqCst), 2);

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts)).await,
            Ok(())
        );
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            2,
            "an approved grant must not re-prompt"
        );

        write_consent(&scope, &settings, &ComputerUseConsent::not_accepted())
            .expect("revoke consent");
        let gate = ConsentPrompt::default();
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("revoked consent must stop new sessions"),
            CONSENT_REQUIRED_ERROR
        );
    }

    /// `settings_v2_set` writes any key the renderer
    /// names, so the same caller that can invoke a computer-use command can
    /// write this row first. Only a grant bound to the per-install secret
    /// opens the gate; the forged row is ignored and the user is still asked.
    #[tokio::test]
    async fn a_consent_row_written_through_settings_does_not_open_the_gate() {
        let settings = settings_state();
        settings
            .service
            .lock()
            .expect("settings lock")
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Json(serde_json::json!({
                    "accepted": true,
                    "accepted_at": "2026-08-21T00:00:00Z",
                    "version": CONSENT_VERSION,
                })),
                SettingCategory::Security,
                false,
            )
            .expect("write forged consent row");

        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("a forged settings row is not consent"),
            CONSENT_REQUIRED_ERROR
        );
        assert_eq!(prompts.load(Ordering::SeqCst), 1);
    }

    /// The whole gate rests on the prompt being answered on the desktop rather
    /// than from inside the app. A compromised renderer can reach every
    /// synthetic-input command, so while the prompt is up those commands must
    /// refuse, otherwise a `Return` aimed at the alert's default button mints
    /// the grant the prompt exists to withhold.
    #[tokio::test]
    async fn synthetic_input_cannot_answer_the_consent_prompt() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let synthetic_input = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));

        let attempts = Arc::clone(&synthetic_input);
        let open_gate = &gate;
        let open_scope = &scope;
        let open_settings = &settings;
        let prompt = move || async move {
            // Everything a renderer could drive at the alert runs through the
            // same gate, so record what each attempt is told while it is up.
            let refused_input = refuse_while_prompt_is_open(open_gate)
                .expect_err("synthetic input while the prompt is open");
            let refused_gate =
                require_consent_via(open_scope, open_settings, open_gate, fixed_prompt(true))
                    .await
                    .expect_err("a second gate entry while the prompt is open");
            let mut attempts = attempts.lock().expect("attempt log");
            attempts.push(refused_input);
            attempts.push(refused_gate);
            false
        };

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, prompt)
                .await
                .expect_err("an unanswered prompt must not grant desktop control"),
            CONSENT_REQUIRED_ERROR
        );
        assert_eq!(
            *synthetic_input.lock().expect("attempt log"),
            vec![
                CONSENT_PROMPT_BUSY_ERROR.to_string(),
                CONSENT_PROMPT_BUSY_ERROR.to_string()
            ]
        );
        assert!(
            !consent_granted(&scope, &settings).expect("read consent"),
            "input synthesized during the prompt must not mint a grant"
        );
    }

    /// The refusal above is blind to every
    /// caller that never passes through a command, the autonomous agent loop
    /// and the LLM UI tools, and each of them can drive a real click at the
    /// dialog's "Allow" button. Both have to take the process-wide OS-automation lock
    /// first, so the prompt holds it: the probe stands in for that click and
    /// must not reach the OS until the user has answered.
    #[tokio::test]
    async fn nothing_in_this_process_can_synthesize_input_while_the_prompt_is_up() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let (reached_os, os_was_reached) = std::sync::mpsc::channel::<()>();
        let synthetic_input = std::sync::Mutex::new(None);

        let probe = &synthetic_input;
        let blocked = &os_was_reached;
        let prompt = move || async move {
            *probe.lock().expect("probe slot") = Some(std::thread::spawn(move || {
                let _os_automation = lock_os_automation().expect("OS automation lock");
                let _ = reached_os.send(());
            }));
            blocked.recv_timeout(Duration::from_millis(250)).is_err()
        };

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, prompt).await,
            Ok(()),
            "synthetic input reached the OS while the consent prompt was on screen"
        );
        os_was_reached
            .recv_timeout(Duration::from_secs(5))
            .expect("automation must resume once the prompt has been answered");
        synthetic_input
            .lock()
            .expect("probe slot")
            .take()
            .expect("probe thread")
            .join()
            .expect("probe thread");
    }

    #[tokio::test]
    async fn stale_or_malformed_consent_records_are_refused() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let mut stale = ComputerUseConsent::accept();
        stale.version = "0.9".to_string();
        write_consent(&scope, &settings, &stale).expect("persist stale consent");
        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .is_err()
        );

        settings
            .service
            .lock()
            .expect("settings lock")
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Boolean(true),
                SettingCategory::Security,
                false,
            )
            .expect("persist malformed consent");
        let gate = ConsentPrompt::default();
        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .is_err()
        );
    }

    /// A shown prompt must not become a wall of dialogs the next `invoke()`
    /// storm can push the user through, whatever the answer was.
    #[tokio::test]
    async fn a_shown_prompt_is_not_reopened_by_a_command_storm() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        for _ in 0..5 {
            assert_eq!(
                require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                    .await
                    .expect_err("a refused prompt must keep computer use closed"),
                CONSENT_REQUIRED_ERROR
            );
        }
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            1,
            "showing the prompt must silence it for the cooldown window"
        );
    }

    /// An approval this machine cannot bind a grant to is still an approval the
    /// user answered, so it must not reopen the prompt on the next command.
    #[tokio::test]
    async fn an_approval_that_cannot_be_recorded_does_not_reopen_the_prompt() {
        let settings = settings_state();
        let scope = ConsentScope::unbindable();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let unrecordable =
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts))
                .await
                .expect_err("a grant that cannot be sealed is not consent");
        assert!(unrecordable.contains("Failed to record computer-use consent"));

        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts))
                .await
                .is_err()
        );
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            1,
            "the cooldown is stamped when the dialog is shown, not when it is answered"
        );
    }

    /// Tauri commands cannot be invoked without a running app, so this guards
    /// the wiring itself: every command that can act on the desktop must open
    /// with the persisted-consent gate. Asserting the first statement, not just
    /// that the call appears somewhere, keeps the gate from drifting below the
    /// action it is supposed to precede. The capability switch may sit above
    /// it: it only refuses, so nothing acts before consent either way.
    #[test]
    fn every_acting_computer_use_command_opens_with_the_consent_gate() {
        const SOURCE: &str = include_str!("computer_use.rs");
        const CAPABILITY_REFUSAL: &str = "if let Some(off) =\n        crate::sys::commands::capabilities::capability_refusal(&app_handle, \"computer_use\").await\n    {\n        return Err(off);\n    }\n";
        let source = SOURCE.replace(CAPABILITY_REFUSAL, "");
        for command in ["pub async fn computer_use_execute_opa_task("] {
            assert_eq!(
                first_statement_of(&source, command),
                "require_consent(&app_handle, &settings).await?;",
                "{command} must refuse to act before it checks persisted computer-use consent"
            );
        }
    }

    fn front(app_name: &str, bundle_id: &str) -> Option<ActiveWindow> {
        Some(ActiveWindow {
            app_name: app_name.to_string(),
            window_title: String::new(),
            bundle_id: Some(bundle_id.to_string()),
        })
    }

    /// The chat `ui_*` tools used to act on whatever app was in front with no
    /// per-app check at all; they now refuse exactly what a run step refuses,
    /// and also this app's own window, where a synthetic click could answer
    /// one of its own approval prompts.
    #[tokio::test]
    async fn chat_desktop_actions_pass_the_same_per_app_gate_as_a_run() {
        const OWN: &str = "com.agiworkforce.test";
        let permissions = Arc::new(AppPermissionManager::new());
        permissions
            .set_permission_with_bundle("Notes", Some("com.apple.Notes"), PermissionStatus::Allowed)
            .await;
        permissions
            .set_permission_with_bundle(
                "Robinhood",
                Some("com.robinhood.app"),
                PermissionStatus::Allowed,
            )
            .await;
        permissions
            .set_permission_with_bundle("Mail", Some("com.apple.mail"), PermissionStatus::Denied)
            .await;

        let allowed =
            refuse_app_window(permissions.clone(), front("Notes", "com.apple.Notes"), OWN).await;
        assert_eq!(allowed, Ok(()));

        for (refused, why) in [
            (
                front("Robinhood", "com.robinhood.app"),
                "the finance refuse-list",
            ),
            (front("Mail", "com.apple.mail"), "an app the user denied"),
            (
                front("Calendar", "com.apple.iCal"),
                "an app nobody approved",
            ),
            (None, "an app that cannot be identified"),
        ] {
            assert!(
                refuse_app_window(permissions.clone(), refused, OWN)
                    .await
                    .is_err(),
                "a chat desktop action reached {why}"
            );
        }

        assert_eq!(
            refuse_app_window(permissions, front("AGI Workforce", OWN), OWN).await,
            Err(SELF_CONTROL_REFUSED_ERROR.to_string())
        );
    }

    /// Launching or focusing an app is how a run gets it on screen, so an app
    /// known only by name is held to the refuse-list and the registry too.
    #[tokio::test]
    async fn an_app_known_only_by_name_is_refused_unless_approved() {
        const OWN: &str = "com.agiworkforce.test";
        let named = |name: &str| {
            Some(ActiveWindow {
                app_name: name.to_string(),
                window_title: String::new(),
                bundle_id: None,
            })
        };
        let permissions = Arc::new(AppPermissionManager::new());
        permissions
            .set_permission("Notes", PermissionStatus::Allowed)
            .await;
        permissions
            .set_permission("Robinhood", PermissionStatus::Allowed)
            .await;

        assert_eq!(
            refuse_app_window(permissions.clone(), named("Notes"), OWN).await,
            Ok(())
        );
        for refused in ["Robinhood", "Bitwarden", "Terminal", "Calendar"] {
            assert!(
                refuse_app_window(permissions.clone(), named(refused), OWN)
                    .await
                    .is_err(),
                "{refused} could be launched or raised"
            );
        }
    }

    /// Input goes to whatever is in front, so a different app taking focus
    /// between the target's activation and the keystroke must stop the action.
    #[test]
    fn input_waits_for_the_target_to_still_be_in_front() {
        let target = TargetApp {
            pid: 10,
            name: "Notes".to_string(),
            bundle_id: Some("com.apple.Notes".to_string()),
        };
        let interloper = TargetApp {
            pid: 11,
            name: "Mail".to_string(),
            bundle_id: Some("com.apple.mail".to_string()),
        };

        assert_eq!(
            target_still_in_front(&target, Some(target.clone())),
            Ok(target.clone())
        );
        assert!(target_still_in_front(&target, Some(interloper)).is_err());
        assert!(target_still_in_front(&target, None).is_err());
    }

    /// The gate is only worth the name while the webview cannot answer it for
    /// the user: an IPC command that records acceptance would put the grant
    /// back within reach of the caller it exists to stop.
    #[test]
    fn no_ipc_command_records_computer_use_consent() {
        const SOURCE: &str = include_str!("computer_use.rs");
        let shipped = SOURCE.split("#[cfg(test)]").next().expect("shipped source");
        let commands: Vec<&str> = shipped.split("#[tauri::command]").skip(1).collect();
        assert!(!commands.is_empty(), "no commands found to scan");
        for body in commands {
            assert!(
                !body.contains("write_consent("),
                "only the native prompt may record computer-use consent"
            );
        }
    }

    #[test]
    fn absent_execution_mode_or_provider_passes() {
        assert!(validate_opa_execution_boundary(None, None).is_ok());
        assert!(validate_opa_execution_boundary(None, Some(Provider::Anthropic)).is_ok());
        assert!(validate_opa_execution_boundary(Some(ChatExecutionMode::LocalOnly), None).is_ok());
    }

    #[test]
    fn local_only_rejects_non_local_providers() {
        for provider in [
            Provider::Anthropic,
            Provider::OpenAI,
            Provider::ManagedCloud,
        ] {
            let err =
                validate_opa_execution_boundary(Some(ChatExecutionMode::LocalOnly), Some(provider))
                    .unwrap_err();
            assert!(err.contains("local_only"), "unexpected error: {err}");
        }
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::LocalOnly),
            Some(Provider::Ollama)
        )
        .is_ok());
    }

    #[test]
    fn byok_rejects_managed_cloud_and_local_providers() {
        for provider in [Provider::ManagedCloud, Provider::Ollama, Provider::LmStudio] {
            let err =
                validate_opa_execution_boundary(Some(ChatExecutionMode::Byok), Some(provider))
                    .unwrap_err();
            assert!(err.contains("byok"), "unexpected error: {err}");
        }
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::Byok),
            Some(Provider::Anthropic)
        )
        .is_ok());
    }

    #[test]
    fn cloud_managed_rejects_local_providers_but_allows_vendor_hints() {
        let err = validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::Vllm),
        )
        .unwrap_err();
        assert!(err.contains("cloud_managed"), "unexpected error: {err}");
        // Vendor strings under the managed boundary are model-family hints;
        // the router's ManagedCloud trust filter prevents direct egress.
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::Anthropic)
        )
        .is_ok());
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::ManagedCloud)
        )
        .is_ok());
    }

    #[tokio::test]
    async fn recently_completed_opa_execution_ids_cannot_be_reused() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(control) =
            register_opa_execution(&state, &execution_id)
                .await
                .expect("first owner should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let duplicate = register_opa_execution(&state, &execution_id)
            .await
            .err()
            .expect("duplicate owner must be rejected");
        assert!(duplicate.contains("already active"));

        finish_opa_execution(&state, &execution_id, &control).await;
        let reuse = register_opa_execution(&state, &execution_id)
            .await
            .err()
            .expect("a retained completed UUID must not acquire desktop control again");
        assert!(reuse.contains("already completed"));
    }

    #[tokio::test]
    async fn distinct_opa_executions_cannot_control_the_desktop_concurrently() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let first_id = uuid::Uuid::new_v4().to_string();
        let second_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(first) = register_opa_execution(&state, &first_id)
            .await
            .expect("first execution should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let overlap = register_opa_execution(&state, &second_id)
            .await
            .err()
            .expect("a second desktop-control owner must be rejected");
        assert!(overlap.contains("already owns desktop control"));

        finish_opa_execution(&state, &first_id, &first).await;
        let OpaExecutionRegistration::Active(second) = register_opa_execution(&state, &second_id)
            .await
            .expect("the next owner may start after shutdown")
        else {
            panic!("second execution was not pre-cancelled");
        };
        finish_opa_execution(&state, &second_id, &second).await;
    }

    #[tokio::test]
    async fn cancellation_before_registration_revokes_a_late_execution() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();

        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "Stop must reserve an unknown valid UUID as revoked"
        );
        assert!(matches!(
            register_opa_execution(&state, &execution_id)
                .await
                .expect("late registration should consume the cancellation reservation"),
            OpaExecutionRegistration::CancelledBeforeStart
        ));
        assert!(state.lock().await.opa_executions.is_empty());
        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "a consumed pre-cancellation remains idempotent"
        );
    }

    #[tokio::test]
    async fn cancellation_after_completion_does_not_consume_pre_start_capacity() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));

        for _ in 0..=MAX_OPA_PRE_CANCELLED_EXECUTIONS {
            let execution_id = uuid::Uuid::new_v4().to_string();
            let OpaExecutionRegistration::Active(control) =
                register_opa_execution(&state, &execution_id)
                    .await
                    .expect("fresh execution should register")
            else {
                panic!("fresh execution must not be pre-cancelled");
            };
            finish_opa_execution(&state, &execution_id, &control).await;
            assert_eq!(cancel_opa_execution(&state, &execution_id).await, Ok(true));
        }

        assert!(state.lock().await.opa_cancelled_before_start.is_empty());
        let future_execution_id = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            cancel_opa_execution(&state, &future_execution_id).await,
            Ok(true),
            "post-completion retries must not exhaust legitimate stop-before-start reservations"
        );
    }

    #[tokio::test]
    async fn cancellation_waits_for_native_execution_shutdown() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(control) =
            register_opa_execution(&state, &execution_id)
                .await
                .expect("execution should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let cancel_state = Arc::clone(&state);
        let cancel_id = execution_id.clone();
        let cancellation =
            tokio::spawn(async move { cancel_opa_execution(&cancel_state, &cancel_id).await });
        tokio::task::yield_now().await;

        assert!(control.cancellation.is_cancelled());
        assert!(
            !cancellation.is_finished(),
            "cancellation must not acknowledge before the executor finishes"
        );

        finish_opa_execution(&state, &execution_id, &control).await;
        assert_eq!(
            cancellation.await.expect("cancel task should join"),
            Ok(true)
        );
        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "repeated cancellation should keep the execution UUID revoked"
        );
    }

    #[tokio::test]
    async fn cancellation_drops_the_in_flight_opa_future() {
        struct DropProbe(Arc<AtomicBool>);
        impl Drop for DropProbe {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let cancellation = CancellationToken::new();
        let dropped = Arc::new(AtomicBool::new(false));
        let probe = DropProbe(Arc::clone(&dropped));
        let execution = async move {
            let _probe = probe;
            std::future::pending::<()>().await;
        };

        cancellation.cancel();
        assert!(await_opa_or_cancellation(&cancellation, execution)
            .await
            .is_none());
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[test]
    fn opa_execution_id_must_be_a_uuid() {
        let error = validate_opa_execution_id("account-a-current-task")
            .expect_err("unbounded caller labels must be rejected");
        assert!(error.contains("UUID"));
    }
}
