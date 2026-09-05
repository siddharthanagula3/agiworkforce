//! AGI Dictation lifecycle commands and the global hotkey bridge.
//!
//! Plan: `docs/specs/desktop-global-voice/spec.md` (phase 1-2). Flaw:
//! `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`.
//!
//! # Single lifecycle owner
//! Every dictation entry path routes through
//! [`crate::features::speech::dictation::DICTATION_COORDINATOR`]:
//! - The in-app path (webview hotkey/UI -> voice store) claims a session via
//!   `dictation_session_begin` before capturing and reports transitions via
//!   `dictation_session_advance` / `dictation_session_end`.
//! - The global OS hotkey hook feeds the same coordinator. System-wide
//!   dictation is NOT available yet, so the coordinator refuses
//!   `global`-source sessions (fail closed) until the plan's release gates
//!   pass; the hook then emits a versioned `refused` event instead of
//!   pretending to record.
//!
//! # Events emitted to the frontend
//! One versioned channel replaces the old free-floating
//! `voice:ptt-start`/`voice:ptt-stop` events (which had zero subscribers):
//!
//! | Event             | Payload                                  |
//! |-------------------|------------------------------------------|
//! | `dictation:event` | `{ version, kind, sessionId?, source?, phase, detail? }` |

use serde::Serialize;
use tauri::Emitter;

use crate::features::speech::dictation::{
    start_os_hook, system_dictation_available, BeginError, DictationOutcome, DictationPhase,
    DictationSnapshot, DictationSource, HotkeyChord, HotkeyEdge, SessionError,
    DICTATION_COORDINATOR, DICTATION_EVENT_VERSION, GLOBAL_HOTKEY_HOOK,
};

pub const INJECTION_UNAVAILABLE: &str =
    "system dictation is unavailable in this build; text injection is disabled";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DictationEventPayload {
    version: u32,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<DictationSource>,
    phase: DictationPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

fn emit_dictation_event(
    app: &tauri::AppHandle,
    kind: &'static str,
    session_id: Option<String>,
    source: Option<DictationSource>,
    detail: Option<String>,
) {
    let payload = DictationEventPayload {
        version: DICTATION_EVENT_VERSION,
        kind,
        session_id,
        source,
        phase: DICTATION_COORDINATOR.snapshot().phase,
        detail,
    };
    if let Err(error) = app.emit("dictation:event", &payload) {
        tracing::warn!("[dictation] failed to emit {}: {}", kind, error);
    }
}

fn parse_source(source: &str) -> Result<DictationSource, String> {
    match source {
        "in_app" => Ok(DictationSource::InApp),
        "global" => Ok(DictationSource::Global),
        other => Err(format!("Unknown dictation source: {other}")),
    }
}

fn parse_phase(phase: &str) -> Result<DictationPhase, String> {
    match phase {
        "transcribing" => Ok(DictationPhase::Transcribing),
        "injecting" => Ok(DictationPhase::Injecting),
        other => Err(format!("Unknown dictation phase: {other}")),
    }
}

fn parse_outcome(outcome: &str) -> Result<DictationOutcome, String> {
    match outcome {
        "completed" => Ok(DictationOutcome::Completed),
        "cancelled" => Ok(DictationOutcome::Cancelled),
        "failed" => Ok(DictationOutcome::Failed),
        other => Err(format!("Unknown dictation outcome: {other}")),
    }
}

fn session_error_message(error: SessionError) -> String {
    match error {
        SessionError::StaleSession => {
            "Stale dictation session ID (a newer session owns the pipeline)".to_string()
        }
        SessionError::NoActiveSession => "No active dictation session".to_string(),
        SessionError::IllegalTransition { from, to } => {
            format!("Illegal dictation transition: {from:?} -> {to:?}")
        }
    }
}

// ---------------------------------------------------------------------------
// Coordinator session commands (used by the in-app voice store)
// ---------------------------------------------------------------------------

/// Claim the dictation pipeline. Errors if another session is active or the
/// source is not admitted in this build.
#[tauri::command]
pub async fn dictation_session_begin(
    source: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let source = parse_source(&source)?;
    match DICTATION_COORDINATOR.begin(source) {
        Ok(session_id) => {
            emit_dictation_event(
                &app,
                "session-started",
                Some(session_id.clone()),
                Some(source),
                None,
            );
            Ok(session_id)
        }
        Err(BeginError::Busy { active_source }) => Err(format!(
            "A dictation session is already active (source: {active_source:?})"
        )),
        Err(BeginError::SourceUnavailable) => {
            Err("System-wide dictation is not available in this build".to_string())
        }
    }
}

/// Advance the active session forward (`transcribing` or `injecting`).
#[tauri::command]
pub async fn dictation_session_advance(
    session_id: String,
    phase: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let phase = parse_phase(&phase)?;
    DICTATION_COORDINATOR
        .advance(&session_id, phase)
        .map_err(session_error_message)?;
    emit_dictation_event(&app, "phase-changed", Some(session_id), None, None);
    Ok(())
}

/// End the active session (`completed`, `cancelled`, or `failed`).
#[tauri::command]
pub async fn dictation_session_end(
    session_id: String,
    outcome: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let outcome = parse_outcome(&outcome)?;
    DICTATION_COORDINATOR
        .end(&session_id, outcome)
        .map_err(session_error_message)?;
    emit_dictation_event(
        &app,
        "session-ended",
        Some(session_id),
        None,
        Some(format!("{outcome:?}").to_lowercase()),
    );
    Ok(())
}

/// Current coordinator snapshot for UIs and diagnostics.
pub async fn dictation_session_snapshot() -> Result<DictationSnapshot, String> {
    Ok(DICTATION_COORDINATOR.snapshot())
}

// ---------------------------------------------------------------------------
// Global hotkey hook commands
// ---------------------------------------------------------------------------

/// Enable the global dictation hotkey hook on `accelerator`, the same chord
/// grammar both desktop shells use (`Alt+Shift+V`, `CommandOrControl+Alt+V`).
///
/// The hook has a real start/stop lifecycle (a single OS listener per
/// process; see `features/speech/dictation/hotkey.rs`) and routes edges into
/// the coordinator. While `system_dictation_available()` is false the
/// coordinator refuses global sessions, so enabling the hook only produces
/// honest `refused` events, it never records or injects.
#[tauri::command]
pub async fn voice_start_global_ptt(
    accelerator: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let chord = HotkeyChord::parse(&accelerator)
        .map_err(|error| format!("Invalid dictation accelerator \"{accelerator}\": {error}"))?;
    let app_for_sink = app.clone();
    let newly_enabled = start_os_hook(
        &GLOBAL_HOTKEY_HOOK,
        chord,
        Box::new(move |edge| match edge {
            HotkeyEdge::Pressed => match DICTATION_COORDINATOR.begin(DictationSource::Global) {
                Ok(session_id) => {
                    emit_dictation_event(
                        &app_for_sink,
                        "session-started",
                        Some(session_id),
                        Some(DictationSource::Global),
                        None,
                    );
                }
                Err(BeginError::SourceUnavailable) => {
                    tracing::debug!(
                        "[dictation] global hotkey pressed but system dictation is unavailable"
                    );
                    emit_dictation_event(
                        &app_for_sink,
                        "refused",
                        None,
                        Some(DictationSource::Global),
                        Some("system dictation unavailable in this build".to_string()),
                    );
                }
                Err(BeginError::Busy { active_source }) => {
                    emit_dictation_event(
                        &app_for_sink,
                        "refused",
                        None,
                        Some(DictationSource::Global),
                        Some(format!("busy: {active_source:?} session active")),
                    );
                }
            },
            HotkeyEdge::Released => {
                // Only a Global-source session may be ended by the global
                // hotkey; an in-app session is owned by the webview path.
                let snapshot = DICTATION_COORDINATOR.snapshot();
                if snapshot.source == Some(DictationSource::Global) {
                    if let Some(session_id) = snapshot.session_id {
                        // No global capture pipeline exists yet (plan phase
                        // 3+), so a release cancels rather than transcribes.
                        let _ = DICTATION_COORDINATOR.end(&session_id, DictationOutcome::Cancelled);
                        emit_dictation_event(
                            &app_for_sink,
                            "session-ended",
                            Some(session_id),
                            Some(DictationSource::Global),
                            Some("cancelled".to_string()),
                        );
                    }
                }
            }
        }),
    )?;

    if newly_enabled {
        tracing::info!("[dictation] global hotkey hook enabled");
    } else {
        tracing::debug!("[dictation] global hotkey hook already enabled, sink refreshed");
    }
    Ok(())
}

/// Disable the global dictation hotkey hook. Emission stops immediately; a
/// Global-source session in flight is cancelled.
#[tauri::command]
pub async fn voice_stop_global_ptt(app: tauri::AppHandle) -> Result<(), String> {
    let was_enabled = GLOBAL_HOTKEY_HOOK.stop();
    if !was_enabled {
        tracing::debug!("[dictation] global hotkey hook not enabled, ignoring stop request");
        return Ok(());
    }

    let snapshot = DICTATION_COORDINATOR.snapshot();
    if snapshot.source == Some(DictationSource::Global) {
        if let Some(session_id) = snapshot.session_id {
            let _ = DICTATION_COORDINATOR.end(&session_id, DictationOutcome::Cancelled);
            emit_dictation_event(
                &app,
                "session-ended",
                Some(session_id),
                Some(DictationSource::Global),
                Some("cancelled".to_string()),
            );
        }
    }

    tracing::info!("[dictation] global hotkey hook disabled");
    Ok(())
}

/// Inject `text` into the currently OS-focused window/field.
///
/// Uses `enigo` with the shared `lock_enigo` mutex so all synthetic input is
/// serialised app-wide. This is a bare typing call with no target
/// pinning/revalidation, secure-field refusal, or clipboard transaction (plan
/// phase 4), so it fails closed on the same capability gate as global
/// dictation: until `system_dictation_available()` is true no caller, present
/// or future, can reach the injection path.
///
/// On macOS this requires the Accessibility permission ("control this computer").
#[tauri::command]
pub async fn voice_inject_text(text: String) -> Result<(), String> {
    if !system_dictation_available() {
        return Err(INJECTION_UNAVAILABLE.to_string());
    }

    if text.is_empty() {
        return Ok(());
    }

    // Offload to a blocking thread, enigo interacts with OS input APIs that
    // can block briefly, and we must not block the Tokio worker threads.
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        use crate::automation::input::lock_enigo;
        use enigo::{Enigo, Keyboard, Settings};

        let _guard = lock_enigo().map_err(|e| format!("Failed to acquire enigo lock: {}", e))?;

        let mut enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("Failed to create Enigo instance: {:?}", e))?;

        enigo
            .text(&text)
            .map_err(|e| format!("Failed to inject text: {:?}", e))?;

        tracing::debug!("[dictation] injected {} chars via enigo", text.len());
        Ok(())
    })
    .await
    .map_err(|e| format!("voice_inject_text task panicked: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn inject_text_refuses_empty_input_instead_of_reporting_success() {
        assert!(
            !system_dictation_available(),
            "this test asserts the fail-closed branch; revisit it when injection ships"
        );

        let refusal = voice_inject_text(String::new())
            .await
            .expect_err("the capability gate must be checked before any other branch");
        assert_eq!(refusal, INJECTION_UNAVAILABLE);
    }

    #[tokio::test]
    async fn inject_text_refuses_before_reaching_the_os_input_path() {
        let refusal = voice_inject_text("dictated words".to_string())
            .await
            .expect_err("injection must not reach enigo while dictation is unavailable");
        assert_eq!(refusal, INJECTION_UNAVAILABLE);
    }
}
