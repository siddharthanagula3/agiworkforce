//! AGI Dictation — system dictation lifecycle (plan:
//! `docs/plans/desktop-system-dictation.md`, flaw:
//! `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`).
//!
//! Phase-1 modules only: the lifecycle coordinator and the stoppable global
//! hotkey hook. Capture, target pinning, injection transactions,
//! personalization, and the remaining plan stages land behind this module as
//! they are proven.

pub mod coordinator;
pub mod hotkey;

pub use coordinator::{
    system_dictation_available, BeginError, DictationCoordinator, DictationOutcome,
    DictationPhase, DictationSnapshot, DictationSource, SessionError, DICTATION_EVENT_VERSION,
};
pub use hotkey::{start_os_hook, GlobalHotkeyHook, HotkeyEdge};

/// Process-wide lifecycle owner. Both the in-app path (webview capture via
/// the voice store) and the global hotkey hook route through this instance.
pub static DICTATION_COORDINATOR: DictationCoordinator = DictationCoordinator::new();

/// Process-wide global hotkey hook (at most one OS listener per process).
pub static GLOBAL_HOTKEY_HOOK: GlobalHotkeyHook = GlobalHotkeyHook::new();
