//! Computer Use Module
//!
//! Implements Anthropic-style Computer Use capability for AGI Workforce.
//! This module enables the AGI to visually observe the screen, plan actions,
//! and execute them autonomously to complete user tasks.
//!
//! # Architecture
//!
//! The module follows the Observe-Plan-Act (OPA) loop pattern:
//! 1. **Observe**: Capture screenshot and analyze current screen state
//! 2. **Plan**: Use vision LLM to determine next actions
//! 3. **Act**: Execute mouse/keyboard actions safely
//! 4. **Verify**: Check if progress was made or task is complete
//!
//! # Safety
//!
//! All actions go through multiple safety layers:
//! - Prompt injection detection in screen content
//! - Action safety validation
//! - Screenshot before/after for undo capability
//! - Configurable confirmation for destructive actions
//!
//! # Example
//!
//! ```rust,ignore
//! use agiworkforce_desktop::automation::computer_use::{
//!     ComputerUseAgent, ComputerUseConfig, ComputerUseTask,
//! };
//!
//! let agent = ComputerUseAgent::new(llm_router, config)?;
//! let result = agent.execute_task(ComputerUseTask {
//!     description: "Open Chrome and search for 'Rust programming'".to_string(),
//!     ..Default::default()
//! }).await?;
//! ```

mod action_executor;
mod app_permissions;
pub mod approval;
pub mod clipboard_permission;
pub mod confirmation;
pub mod consent;
pub mod control;
mod observe_plan_act;
mod run_start;
mod safety;
mod session;
mod step_routing;
mod target_app;
mod targeted_input;
mod types;
mod visual_reasoner;
mod window_manager;
mod zoom;

#[cfg(test)]
mod tests;

pub use app_permissions::{
    ensure_navigation_url_allowed, is_always_blocked_bundle, is_always_blocked_host, AppPermission,
    AppPermissionManager, PermissionDecision, PermissionStatus, ALWAYS_BLOCKED_BUNDLE_IDS,
    ALWAYS_BLOCKED_URL_HOSTS,
};
pub use approval::{action_class, action_tool_name, approval_request};
pub use clipboard_permission::{
    claim_clipboard_read, clipboard_read_is_allowed, record_clipboard_read_decision,
    revoke_clipboard_read, CLIPBOARD_READ_DENIED,
};
pub use confirmation::{ConfirmationOutcome, CONFIRMATION_TIMEOUT_SECS};
pub use consent::{ComputerUseConsent, CONSENT_SETTINGS_KEY, CONSENT_VERSION};
pub use control::{ControlState, DialogResponse};
pub use observe_plan_act::{
    CompletionReason, ComputerUseAgent, ComputerUseConfig, ExecutionState, OpaLoopResult,
};
pub use run_start::{
    classify_start_apps, settle_front_app, FrontAppState, StartCandidate, StartSurface,
};
pub use safety::{
    describe_app_permission_block, ComputerUseSafetyLayer, PromptInjectionDetector, SafetyConfig,
    SafetyDecision, SafetyReason,
};
pub use session::{
    capture_to_disk, ensure_capture_may_be_written, prepare_screenshot_dir, write_screenshot,
    ActionSnapshot, ComputerUseSession, SessionConfig, SessionEvent, SessionManager, UndoAction,
};
pub use target_app::{
    app_at_point, app_with_keyboard_focus, bring_to_front, ensure_element_in_target,
    ensure_point_in_target, frontmost_app, match_target_app, resolve_target_app,
    running_target_apps, same_app, TargetApp,
};
pub use targeted_input::{
    app_argument, click_in_app, element_in_gated_app, ensure_app_may_be_raised,
    focus_window_in_app, front_app_state, guard_front_app_input, toggle_in_app, type_in_app,
    ActedOn, UiTarget, APP_REQUIRED, TARGET_APP_PARAMETER,
};
pub use types::{
    ComputerUseAction, ComputerUseTask, Coordinate, ElementBounds, HotkeyModifier, MouseButton,
    ScreenAnalysis, ScreenElement, ScrollDirection, TaskOutcome, TaskProgress, WaitCondition,
};
pub use visual_reasoner::{ScreenObservation, VisualReasoner, VisualReasonerConfig};
pub use window_manager::{
    ActiveWindow, AppWindow, WindowActivation, WindowCoordinator, WindowEnumerator,
    WindowManagerConfig,
};
pub use zoom::{
    suggest_zoom_level, zoom_around_point, zoom_region, InterpolationMethod, Region, ZoomAction,
    ZoomLevel, ZoomResult,
};
