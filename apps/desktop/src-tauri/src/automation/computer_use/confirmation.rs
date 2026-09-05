//! The pause a confirmation-gated computer-use step waits on.
//!
//! The step does not run and the loop does not move on: it parks on the same
//! channel every other desktop tool confirmation parks on
//! ([`request_tool_confirmation_on_surface`]), so one standing-grant rule,
//! one pending map and one [`respond_tool_confirmation`] answer them all. What
//! differs is the surface. A computer-use step is reviewed in the voice consent
//! dialog, which reads the cross-surface [`ToolApprovalRequest`], so the request
//! is emitted there instead of on the tool dialog channel and the user is never
//! shown two Approve buttons for one decision.
//!
//! The window is raised before the request goes out, because a task that has
//! stopped to ask cannot be answered on a surface the user cannot see.

use agiworkforce_protocol::tool_primitive::ToolApprovalRequest;
use tauri::{AppHandle, Emitter, Manager};

use super::approval;
use super::safety::SafetyDecision;
use super::types::ComputerUseAction;
use crate::sys::commands::tool_confirmation::{
    request_tool_confirmation_on_surface, ConfirmationSurface, ToolConfirmationState,
};
use crate::sys::security::ToolConfirmationRequest;

/// How long a paused step waits for an answer before the pause ends as a
/// denial.
///
/// A computer-use pause holds the pointer and keyboard of a machine the user
/// is sitting at, so it is bounded well below the five minutes a background
/// tool approval may take: two minutes is long enough to read the action and
/// decide, short enough that a user who walked away gets their desktop back
/// rather than a task frozen mid-step. An expiry is a denial, never a
/// fall-through to running the action.
pub const CONFIRMATION_TIMEOUT_SECS: u64 = 120;

/// The user is being asked, so the run is attended for the length of the
/// pause. The unattended blocks the loop emits elsewhere keep their own value.
const PAUSED_RUN_IS_ATTENDED: bool = false;

const CONFIRMATION_EVENT: &str = "computer_use:confirmation_required";
const RESOLUTION_EVENT: &str = "computer_use:confirmation_resolved";
const APPROVED_OUTCOME: &str = "approved";
const DENIED_OUTCOME: &str = "denied";
const EXPIRED_OUTCOME: &str = "expired";
const CONFIRMATION_SERVICE_UNAVAILABLE: &str =
    "the approval service is unavailable, so the step cannot be confirmed";
const MAIN_WINDOW_LABEL: &str = "main";
const DECISION_WARNING_SEPARATOR: &str = ", ";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfirmationOutcome {
    Approved,
    Denied,
    Expired,
}

impl ConfirmationOutcome {
    pub fn label(self) -> &'static str {
        match self {
            Self::Approved => APPROVED_OUTCOME,
            Self::Denied => DENIED_OUTCOME,
            Self::Expired => EXPIRED_OUTCOME,
        }
    }

    /// An answer that is not an approval ends the task. Neither a denial nor an
    /// expiry may fall through to the action.
    pub fn is_approved(self) -> bool {
        self == Self::Approved
    }
}

/// Raises the surface that has to answer.
///
/// A hidden or minimised window is brought back and focused; a visible one is
/// focused where it stands. This mirrors where a global dictation press lands,
/// so the two interruptions the desktop can raise behave the same way.
fn surface_the_request<R: tauri::Runtime>(app_handle: &AppHandle<R>) {
    let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
    }
    let _ = window.set_focus();
}

/// The request the paused step waits on, as the desktop's approval surfaces
/// read it. `rememberable` is the contract's answer for this tool, so a tool on
/// the never-rememberable list never offers the option and every other one
/// offers it at session scope.
pub fn confirmation_request(
    request_id: String,
    session_id: &str,
    action: &ComputerUseAction,
    decision: &SafetyDecision,
) -> ToolApprovalRequest {
    approval::approval_request(
        request_id,
        session_id.to_string(),
        action,
        decision,
        PAUSED_RUN_IS_ATTENDED,
    )
}

/// The consent dialog a paused computer-use step is answered on.
///
/// It renders the cross-surface approval request, so the request goes out on
/// the computer-use stream rather than the tool dialog channel. The pause is
/// not held here: this only shows it and reports its expiry.
pub struct ComputerUseSurface<'a, R: tauri::Runtime> {
    app_handle: &'a AppHandle<R>,
    session_id: String,
    step_index: u32,
    approval: ToolApprovalRequest,
}

impl<R: tauri::Runtime> ConfirmationSurface for ComputerUseSurface<'_, R> {
    fn present(&self, _request: &ToolConfirmationRequest) -> Result<(), String> {
        surface_the_request(self.app_handle);

        self.app_handle
            .emit(
                CONFIRMATION_EVENT,
                serde_json::json!({
                    "sessionId": self.session_id,
                    "stepIndex": self.step_index,
                    "approval": self.approval,
                }),
            )
            .map_err(|error| error.to_string())
    }

    fn expire(&self, _request: &ToolConfirmationRequest) {
        self.resolved(ConfirmationOutcome::Expired);
    }
}

impl<R: tauri::Runtime> ComputerUseSurface<'_, R> {
    fn resolved(&self, outcome: ConfirmationOutcome) {
        let _ = self.app_handle.emit(
            RESOLUTION_EVENT,
            serde_json::json!({
                "sessionId": self.session_id,
                "stepIndex": self.step_index,
                "outcome": outcome.label(),
            }),
        );
    }
}

/// Pauses on one step until the user answers, the answer times out, or the
/// guard refuses to ask at all.
///
/// A guard that refuses (an agent mode that does not permit this tool, a stored
/// denial) is a denial, not a pause: there is nothing for the user to answer.
pub async fn confirm_step<R: tauri::Runtime>(
    app_handle: &AppHandle<R>,
    session_id: &str,
    step_index: u32,
    action: &ComputerUseAction,
    decision: &SafetyDecision,
) -> ConfirmationOutcome {
    let Some(state) = app_handle.try_state::<ToolConfirmationState>() else {
        tracing::error!("[ComputerUse] {}", CONFIRMATION_SERVICE_UNAVAILABLE);
        return ConfirmationOutcome::Denied;
    };

    let tool = approval::action_tool_name(action);
    let parameters = serde_json::to_value(action).unwrap_or_else(|_| serde_json::json!({}));
    let request = state.tool_guard().create_confirmation_request(
        &tool,
        &parameters,
        Some(&decision.warnings.join(DECISION_WARNING_SEPARATOR)),
    );
    let surface = ComputerUseSurface {
        app_handle,
        session_id: session_id.to_string(),
        step_index,
        approval: confirmation_request(request.request_id.clone(), session_id, action, decision),
    };

    let outcome = match request_tool_confirmation_on_surface(
        app_handle,
        state.inner(),
        request,
        CONFIRMATION_TIMEOUT_SECS,
        &surface,
    )
    .await
    {
        Ok(true) => ConfirmationOutcome::Approved,
        Ok(false) => ConfirmationOutcome::Denied,
        Err(detail) => {
            tracing::warn!(
                "[ComputerUse] Step {} was not confirmed: {}",
                step_index,
                detail
            );
            ConfirmationOutcome::Expired
        }
    };

    if outcome != ConfirmationOutcome::Expired {
        surface.resolved(outcome);
    }

    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::computer_use::types::{HotkeyModifier, MouseButton};
    use crate::sys::commands::tool_confirmation::{is_tool_remember_eligible, NEVER_REMEMBERABLE};
    use crate::sys::security::tool_guard::{RiskLevel, ToolSafetyTier};
    use crate::sys::security::ToolConfirmationResponse;
    use agiworkforce_protocol::tool_primitive::ToolApprovalReason;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    const SESSION: &str = "session-1";
    const REQUEST: &str = "request-1";
    const PAUSED_TOOL: &str = "computer_use_click";
    /// Long enough that an answer given in these tests always beats it.
    const PAUSE_BOUND_SECS: u64 = 30;
    /// Short enough that the expiry case does not slow the suite down.
    const EXPIRING_BOUND_SECS: u64 = 1;
    const ANSWER_DELAY: Duration = Duration::from_millis(20);
    const BLUR_SETTLE: Duration = Duration::from_millis(60);

    /// Stands in for the dialog. It records that the request was shown and
    /// whether the pause expired, which is all the channel asks of a surface.
    #[derive(Default)]
    struct RecordingSurface {
        presented: AtomicUsize,
        expired: AtomicUsize,
    }

    impl ConfirmationSurface for RecordingSurface {
        fn present(&self, _request: &ToolConfirmationRequest) -> Result<(), String> {
            self.presented.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn expire(&self, _request: &ToolConfirmationRequest) {
            self.expired.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn paused_request() -> ToolConfirmationRequest {
        ToolConfirmationRequest {
            request_id: String::from(REQUEST),
            tool_name: String::from(PAUSED_TOOL),
            tool_description: String::from("press a control"),
            parameters: serde_json::json!({}),
            risk_level: RiskLevel::High,
            safety_tier: ToolSafetyTier::RequiresConfirmation,
            reason: String::from("closes the window"),
            reversible: false,
            undo_description: None,
        }
    }

    fn answer(approved: bool) -> ToolConfirmationResponse {
        ToolConfirmationResponse {
            request_id: String::from(REQUEST),
            approved,
            remember_choice: false,
            reason: (!approved).then(|| String::from("denied by the user")),
        }
    }

    async fn pause_answered_by(
        state: &Arc<ToolConfirmationState>,
        surface: &RecordingSurface,
        answer: impl FnOnce(&ToolConfirmationState) + Send + 'static,
    ) -> Result<bool, String> {
        let pending = Arc::clone(state);
        let answering = tokio::spawn(async move {
            tokio::time::sleep(ANSWER_DELAY).await;
            answer(&pending);
        });

        let outcome = state
            .await_confirmation(paused_request(), PAUSE_BOUND_SECS, surface)
            .await;
        answering.await.expect("the answering task ran");

        outcome
    }

    fn destructive_decision() -> SafetyDecision {
        SafetyDecision::needs_confirmation("Alt+F4 will close the current window")
    }

    fn closing_hotkey() -> ComputerUseAction {
        ComputerUseAction::Hotkey {
            modifiers: vec![HotkeyModifier::Alt],
            key: String::from("f4"),
        }
    }

    #[test]
    fn a_pause_asks_with_the_reason_the_harness_computed() {
        let request = confirmation_request(
            String::from(REQUEST),
            SESSION,
            &closing_hotkey(),
            &destructive_decision(),
        );

        assert_eq!(request.request_id, REQUEST);
        assert_eq!(request.call_id, SESSION);
        assert_eq!(request.reason, ToolApprovalReason::UserRequiresApproval);
        assert!(!request.unattended);
    }

    #[test]
    fn a_computer_use_step_may_be_remembered_for_the_session_and_a_listed_tool_never_may() {
        let request = confirmation_request(
            String::from(REQUEST),
            SESSION,
            &ComputerUseAction::Click {
                x: 4,
                y: 8,
                button: MouseButton::Left,
            },
            &destructive_decision(),
        );

        assert!(request.rememberable);
        assert!(is_tool_remember_eligible(&request.tool));

        for tool in NEVER_REMEMBERABLE {
            assert!(!is_tool_remember_eligible(tool), "{tool}");
        }
    }

    #[test]
    fn every_outcome_but_approval_ends_the_task() {
        assert!(ConfirmationOutcome::Approved.is_approved());
        assert!(!ConfirmationOutcome::Denied.is_approved());
        assert!(!ConfirmationOutcome::Expired.is_approved());
        assert_eq!(ConfirmationOutcome::Expired.label(), EXPIRED_OUTCOME);
    }

    #[tokio::test]
    async fn an_approval_resumes_the_step_it_paused_on() {
        let state = Arc::new(ToolConfirmationState::new());
        let surface = RecordingSurface::default();

        let answered = pause_answered_by(&state, &surface, |pending| {
            pending.resolve_pending(answer(true)).expect("resolves");
        })
        .await;

        assert_eq!(answered, Ok(true));
        assert_eq!(surface.presented.load(Ordering::SeqCst), 1);
        assert_eq!(surface.expired.load(Ordering::SeqCst), 0);
        assert_eq!(state.pending_count(), 0);
        assert!(ConfirmationOutcome::Approved.is_approved());
    }

    #[tokio::test]
    async fn a_denial_ends_the_task_and_never_falls_through_to_the_action() {
        let state = Arc::new(ToolConfirmationState::new());
        let surface = RecordingSurface::default();

        let answered = pause_answered_by(&state, &surface, |pending| {
            pending.resolve_pending(answer(false)).expect("resolves");
        })
        .await;

        assert_eq!(answered, Ok(false));
        assert_eq!(surface.expired.load(Ordering::SeqCst), 0);
        assert!(!ConfirmationOutcome::Denied.is_approved());
    }

    #[tokio::test]
    async fn an_unanswered_pause_expires_as_a_denial_rather_than_waiting() {
        let state = ToolConfirmationState::new();
        let surface = RecordingSurface::default();

        let answered = state
            .await_confirmation(paused_request(), EXPIRING_BOUND_SECS, &surface)
            .await;

        assert!(answered.is_err());
        assert_eq!(surface.expired.load(Ordering::SeqCst), 1);
        assert_eq!(state.pending_count(), 0);
        assert!(!ConfirmationOutcome::Expired.is_approved());
    }

    #[tokio::test]
    async fn the_pause_outlives_the_window_losing_focus() {
        let state = Arc::new(ToolConfirmationState::new());
        let surface = RecordingSurface::default();
        let pending = Arc::clone(&state);

        let answered = tokio::spawn(async move {
            // Nothing about the wait is tied to a window, so the request is
            // still there to be re-read and still answerable after the app has
            // lost and regained focus.
            tokio::time::sleep(BLUR_SETTLE).await;
            let request = pending
                .pending_request(REQUEST)
                .expect("the pause survives the app losing focus");
            assert_eq!(request.tool_name, PAUSED_TOOL);
            assert_eq!(pending.pending_count(), 1);
            pending.resolve_pending(answer(true)).expect("resolves");
        });

        let outcome = state
            .await_confirmation(paused_request(), PAUSE_BOUND_SECS, &surface)
            .await;
        answered.await.expect("the answering task ran");

        assert_eq!(outcome, Ok(true));
        assert_eq!(surface.expired.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_session_grant_answers_the_next_step_and_a_listed_tool_still_asks() {
        let state = ToolConfirmationState::new();

        state.approve_for_session(PAUSED_TOOL);
        assert!(state.is_session_approved(PAUSED_TOOL));

        for tool in NEVER_REMEMBERABLE {
            state.approve_for_session(tool);
            assert!(!state.is_session_approved(tool), "{tool}");
        }
    }
}
