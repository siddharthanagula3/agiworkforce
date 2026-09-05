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
pub mod anthropic_agent;
mod app_permissions;
pub mod approval;
pub mod confirmation;
pub mod consent;
mod observe_plan_act;
mod safety;
mod session;
mod step_routing;
mod types;
mod visual_reasoner;
mod window_manager;
mod zoom;

#[cfg(test)]
mod tests;

pub use anthropic_agent::{AnthropicComputerUseAgent, AnthropicComputerUseConfig};
pub use app_permissions::{
    ensure_navigation_url_allowed, is_always_blocked_bundle, is_always_blocked_host, AppPermission,
    AppPermissionManager, AppPermissionRequest, PermissionDecision, PermissionStatus,
    ALWAYS_BLOCKED_BUNDLE_IDS, ALWAYS_BLOCKED_URL_HOSTS,
};
pub use approval::{action_class, action_tool_name, approval_request};
pub use confirmation::{ConfirmationOutcome, CONFIRMATION_TIMEOUT_SECS};
pub use consent::{ComputerUseConsent, CONSENT_SETTINGS_KEY, CONSENT_VERSION};
pub use observe_plan_act::{
    CompletionReason, ComputerUseAgent, ComputerUseConfig, ExecutionState, OpaLoopResult,
};
pub use safety::{
    ComputerUseSafetyLayer, PromptInjectionDetector, SafetyConfig, SafetyDecision, SafetyReason,
};
pub use session::{
    ActionSnapshot, ComputerUseSession, SessionConfig, SessionEvent, SessionManager, UndoAction,
};
pub use types::{
    ComputerUseAction, ComputerUseTask, Coordinate, ElementBounds, HotkeyModifier, MouseButton,
    ScreenAnalysis, ScreenElement, ScrollDirection, TaskOutcome, TaskProgress, WaitCondition,
};
pub use visual_reasoner::{
    ElementDetection, ScreenObservation, VisualReasoner, VisualReasonerConfig,
};
pub use window_manager::{
    ActiveWindow, AppWindow, WindowActivation, WindowCoordinator, WindowEnumerator,
    WindowManagerConfig,
};
pub use zoom::{
    suggest_zoom_level, zoom_around_point, zoom_region, zoom_region_raw, InterpolationMethod,
    Region, ZoomAction, ZoomLevel, ZoomResult,
};
