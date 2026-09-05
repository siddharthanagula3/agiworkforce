//! AGI Dictation, system dictation lifecycle (plan:
//! `docs/specs/desktop-global-voice/spec.md`, flaw:
//! `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`).
//!
//! Phase-1 modules only: the lifecycle coordinator and the stoppable global
//! hotkey hook. Capture, target pinning, injection transactions,
//! personalization, and the remaining plan stages land behind this module as
//! they are proven.

pub mod accelerator;
pub mod capture;
pub mod coordinator;
pub mod hotkey;
pub mod transcription;

pub use accelerator::{ChordParseError, ChordTracker, HotkeyChord};
pub use capture::{
    list_input_devices, start_capture, BoundedSampleSink, CaptureHandle, InputDeviceInfo,
    MAX_CAPTURE_SECONDS,
};
pub use coordinator::{
    ensure_text_injection_allowed, system_dictation_available, BeginError, DictationCoordinator,
    DictationOutcome, DictationPhase, DictationSnapshot, DictationSource, SessionError,
    DICTATION_EVENT_VERSION, TEXT_INJECTION_UNAVAILABLE,
};
pub use hotkey::{start_os_hook, GlobalHotkeyHook, HotkeyEdge};
pub use transcription::{
    missing_byok_openai_key_error, parse_transcription_mode, ModeParseError, TranscriptionMode,
};

/// Process-wide lifecycle owner. Both the in-app path (webview capture via
/// the voice store) and the global hotkey hook route through this instance.
pub static DICTATION_COORDINATOR: DictationCoordinator = DictationCoordinator::new();

/// Process-wide global hotkey hook (at most one OS listener per process).
pub static GLOBAL_HOTKEY_HOOK: GlobalHotkeyHook = GlobalHotkeyHook::new();
