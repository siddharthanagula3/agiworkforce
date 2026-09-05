//! One owner for the AGI Dictation lifecycle.
//!
//! Phase 1 of `docs/specs/desktop-global-voice/spec.md`: a single state machine
//! (`idle -> capturing -> transcribing -> injecting -> idle`) that both entry
//! paths must route through, the in-app hotkey (webview capture) and the
//! global OS hotkey hook. The coordinator owns admission, session identity,
//! and transition legality; it deliberately has no Tauri, audio, or injection
//! dependencies so the machine is unit-testable in isolation.
//!
//! Session identity: every session gets a unique ID, and every mutation must
//! present the ID it was issued. A call carrying a stale ID (an older session
//! finished or was cancelled) is rejected with [`SessionError::StaleSession`]
//! so late events can never corrupt a newer session.
//!
//! Global-source admission fails closed: system-wide dictation is not
//! available until the plan's phase-7 release gates pass for an OS/channel
//! (tracked by `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`), so
//! [`system_dictation_available`] is a compile-time `false` and
//! [`DictationCoordinator::begin`] refuses `Global` sessions.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Wire version for `dictation:event` payloads.
pub const DICTATION_EVENT_VERSION: u32 = 1;

/// Whether system-wide (outside-the-app) dictation is available in this
/// build. Single source of truth for the capability probe surfaced through
/// `voice_get_capabilities` and for global-source admission below.
///
/// Stays `false` until the signed-build release gates in
/// `docs/specs/desktop-global-voice/spec.md` pass; do not flip it from UI or
/// settings code.
pub const fn system_dictation_available() -> bool {
    false
}

/// Refusal reason returned by [`ensure_text_injection_allowed`].
pub const TEXT_INJECTION_UNAVAILABLE: &str =
    "text injection is unavailable in this build: system dictation has not passed its release gates";

/// Admission for synthetic keystroke injection into the OS-focused field.
///
/// Injection has no target pinning, secure-field refusal, or clipboard
/// transaction yet (plan phase 4), so it fails closed on the same capability
/// probe that refuses `Global` sessions instead of relying on having no
/// callers.
pub fn ensure_text_injection_allowed() -> Result<(), String> {
    if system_dictation_available() {
        Ok(())
    } else {
        Err(TEXT_INJECTION_UNAVAILABLE.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DictationPhase {
    Idle,
    Capturing,
    Transcribing,
    Injecting,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DictationSource {
    /// The document-scoped hotkey / UI inside AGI's own window.
    InApp,
    /// The OS-level global hotkey hook.
    Global,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DictationOutcome {
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BeginError {
    /// Another session owns the pipeline; a second capture must never start.
    Busy { active_source: DictationSource },
    /// The requesting source is not admitted in this build (fail closed).
    SourceUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    /// The presented session ID is not the active session (late/stale event).
    StaleSession,
    /// No session is active at all.
    NoActiveSession,
    /// The requested phase is not reachable from the current phase.
    IllegalTransition {
        from: DictationPhase,
        to: DictationPhase,
    },
}

/// Snapshot of the coordinator for UIs and diagnostics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationSnapshot {
    pub phase: DictationPhase,
    pub session_id: Option<String>,
    pub source: Option<DictationSource>,
}

#[derive(Debug, Clone)]
struct ActiveSession {
    id: String,
    source: DictationSource,
    phase: DictationPhase,
}

/// The single dictation lifecycle owner. `None` inside the mutex means idle.
pub struct DictationCoordinator {
    active: Mutex<Option<ActiveSession>>,
    counter: AtomicU64,
}

impl Default for DictationCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl DictationCoordinator {
    pub const fn new() -> Self {
        Self {
            active: Mutex::new(None),
            counter: AtomicU64::new(0),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<ActiveSession>> {
        // A poisoned lock means a panic mid-transition; recovering the guard
        // and continuing on the (still-consistent) Option is safer than
        // wedging dictation for the rest of the process.
        self.active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Start a new session in `Capturing`. Exactly one session may be active.
    pub fn begin(&self, source: DictationSource) -> Result<String, BeginError> {
        if source == DictationSource::Global && !system_dictation_available() {
            return Err(BeginError::SourceUnavailable);
        }

        let mut guard = self.lock();
        if let Some(active) = guard.as_ref() {
            return Err(BeginError::Busy {
                active_source: active.source,
            });
        }

        let sequence = self.counter.fetch_add(1, Ordering::SeqCst);
        let id = format!("dictation-{}-{}", sequence, uuid::Uuid::new_v4());
        *guard = Some(ActiveSession {
            id: id.clone(),
            source,
            phase: DictationPhase::Capturing,
        });
        Ok(id)
    }

    /// Advance the active session forward. Only the forward edges of the
    /// machine are legal: `Capturing -> Transcribing -> Injecting`.
    pub fn advance(
        &self,
        session_id: &str,
        to: DictationPhase,
    ) -> Result<DictationPhase, SessionError> {
        let mut guard = self.lock();
        let active = guard.as_mut().ok_or(SessionError::NoActiveSession)?;
        if active.id != session_id {
            return Err(SessionError::StaleSession);
        }

        let legal = matches!(
            (active.phase, to),
            (DictationPhase::Capturing, DictationPhase::Transcribing)
                | (DictationPhase::Transcribing, DictationPhase::Injecting)
        );
        if !legal {
            return Err(SessionError::IllegalTransition {
                from: active.phase,
                to,
            });
        }
        active.phase = to;
        Ok(to)
    }

    /// End the active session from any phase and return to idle.
    pub fn end(
        &self,
        session_id: &str,
        _outcome: DictationOutcome,
    ) -> Result<DictationPhase, SessionError> {
        let mut guard = self.lock();
        let active = guard.as_ref().ok_or(SessionError::NoActiveSession)?;
        if active.id != session_id {
            return Err(SessionError::StaleSession);
        }
        let from = active.phase;
        *guard = None;
        Ok(from)
    }

    pub fn snapshot(&self) -> DictationSnapshot {
        let guard = self.lock();
        match guard.as_ref() {
            Some(active) => DictationSnapshot {
                phase: active.phase,
                session_id: Some(active.id.clone()),
                source: Some(active.source),
            },
            None => DictationSnapshot {
                phase: DictationPhase::Idle,
                session_id: None,
                source: None,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begins_in_app_session_and_reports_capturing() {
        let coordinator = DictationCoordinator::new();
        let id = coordinator.begin(DictationSource::InApp).expect("begin");
        let snapshot = coordinator.snapshot();
        assert_eq!(snapshot.phase, DictationPhase::Capturing);
        assert_eq!(snapshot.session_id.as_deref(), Some(id.as_str()));
        assert_eq!(snapshot.source, Some(DictationSource::InApp));
    }

    #[test]
    fn refuses_global_source_while_system_dictation_is_unavailable() {
        let coordinator = DictationCoordinator::new();
        assert_eq!(
            coordinator.begin(DictationSource::Global),
            Err(BeginError::SourceUnavailable)
        );
        assert_eq!(coordinator.snapshot().phase, DictationPhase::Idle);
    }

    #[test]
    fn refuses_second_concurrent_session() {
        let coordinator = DictationCoordinator::new();
        let _first = coordinator.begin(DictationSource::InApp).expect("begin");
        assert_eq!(
            coordinator.begin(DictationSource::InApp),
            Err(BeginError::Busy {
                active_source: DictationSource::InApp
            })
        );
    }

    #[test]
    fn walks_the_full_forward_lifecycle() {
        let coordinator = DictationCoordinator::new();
        let id = coordinator.begin(DictationSource::InApp).expect("begin");
        assert_eq!(
            coordinator.advance(&id, DictationPhase::Transcribing),
            Ok(DictationPhase::Transcribing)
        );
        assert_eq!(
            coordinator.advance(&id, DictationPhase::Injecting),
            Ok(DictationPhase::Injecting)
        );
        assert_eq!(
            coordinator.end(&id, DictationOutcome::Completed),
            Ok(DictationPhase::Injecting)
        );
        assert_eq!(coordinator.snapshot().phase, DictationPhase::Idle);
    }

    #[test]
    fn rejects_illegal_transitions() {
        let coordinator = DictationCoordinator::new();
        let id = coordinator.begin(DictationSource::InApp).expect("begin");
        assert_eq!(
            coordinator.advance(&id, DictationPhase::Injecting),
            Err(SessionError::IllegalTransition {
                from: DictationPhase::Capturing,
                to: DictationPhase::Injecting,
            })
        );
        assert_eq!(
            coordinator.advance(&id, DictationPhase::Capturing),
            Err(SessionError::IllegalTransition {
                from: DictationPhase::Capturing,
                to: DictationPhase::Capturing,
            })
        );
        assert_eq!(
            coordinator.advance(&id, DictationPhase::Idle),
            Err(SessionError::IllegalTransition {
                from: DictationPhase::Capturing,
                to: DictationPhase::Idle,
            })
        );
    }

    #[test]
    fn ignores_stale_session_ids_from_an_older_session() {
        let coordinator = DictationCoordinator::new();
        let old = coordinator.begin(DictationSource::InApp).expect("begin");
        coordinator
            .end(&old, DictationOutcome::Cancelled)
            .expect("end");

        let newer = coordinator.begin(DictationSource::InApp).expect("begin");
        assert_ne!(old, newer, "session IDs must be unique across sessions");

        // Late events carrying the old ID must not touch the new session.
        assert_eq!(
            coordinator.advance(&old, DictationPhase::Transcribing),
            Err(SessionError::StaleSession)
        );
        assert_eq!(
            coordinator.end(&old, DictationOutcome::Failed),
            Err(SessionError::StaleSession)
        );
        assert_eq!(coordinator.snapshot().phase, DictationPhase::Capturing);
        assert_eq!(
            coordinator.snapshot().session_id.as_deref(),
            Some(newer.as_str())
        );
    }

    #[test]
    fn end_is_reachable_from_every_active_phase() {
        for target in [
            DictationPhase::Capturing,
            DictationPhase::Transcribing,
            DictationPhase::Injecting,
        ] {
            let coordinator = DictationCoordinator::new();
            let id = coordinator.begin(DictationSource::InApp).expect("begin");
            if target != DictationPhase::Capturing {
                coordinator
                    .advance(&id, DictationPhase::Transcribing)
                    .expect("to transcribing");
            }
            if target == DictationPhase::Injecting {
                coordinator
                    .advance(&id, DictationPhase::Injecting)
                    .expect("to injecting");
            }
            assert_eq!(
                coordinator.end(&id, DictationOutcome::Cancelled),
                Ok(target)
            );
            assert_eq!(coordinator.snapshot().phase, DictationPhase::Idle);
        }
    }

    #[test]
    fn ending_without_an_active_session_reports_no_active_session() {
        let coordinator = DictationCoordinator::new();
        assert_eq!(
            coordinator.end("dictation-0-unknown", DictationOutcome::Cancelled),
            Err(SessionError::NoActiveSession)
        );
    }
}
