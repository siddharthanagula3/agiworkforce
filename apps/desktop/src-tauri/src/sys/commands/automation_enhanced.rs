use std::sync::{Mutex, MutexGuard};

use tauri::AppHandle;

use crate::automation::recorder::{
    global_recorder, DiscardedRecording, Recording, RecordingSession, RecordingStatus,
};
use crate::sys::native_confirm::{ConfirmGate, NativeConfirm};

const START_RECORDING_CONFIRM_LABEL: &str = "Start Recording";
const START_RECORDING_REQUEST: &str = "start-recording";
const RECORDING_DECLINED_MESSAGE: &str =
    "Recording was not confirmed, so nothing is being recorded.";
const RECORDING_NOT_CONFIRMED_MESSAGE: &str =
    "This recording was not started with your confirmation, so it was discarded.";

/// One recording question at a time, and a wait after a no that grows while
/// the noes keep coming.
static RECORDING_DECISIONS: ConfirmGate = ConfirmGate::new();

/// What the user's yes covers: the session it started and, once that session
/// is stopped, the recording it produced. Nothing else is handed to the
/// window.
struct ConfirmedRecording {
    session_id: Option<String>,
    recording_id: Option<String>,
}

static CONFIRMED_RECORDING: Mutex<ConfirmedRecording> = Mutex::new(ConfirmedRecording {
    session_id: None,
    recording_id: None,
});

fn confirmed_recording() -> MutexGuard<'static, ConfirmedRecording> {
    match CONFIRMED_RECORDING.lock() {
        Ok(confirmed) => confirmed,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn is_the_confirmed_one(confirmed: Option<&str>, found: &str) -> bool {
    confirmed == Some(found)
}

fn start_recording_question() -> NativeConfirm {
    NativeConfirm {
        title: "Record what you do on this computer?".to_string(),
        body: "AGI Desktop will record every click and every key you press, in every app, until you stop the recording. Anything you type while it runs is recorded, passwords included.".to_string(),
        confirm_label: START_RECORDING_CONFIRM_LABEL.to_string(),
    }
}

/// Starts recording the user's clicks and keystrokes in every app. The
/// recording is handed back to the window when it stops, so a script in the
/// window could otherwise start one and read what was typed. The yes is taken
/// in a native dialog; a recording already running is left as it is.
#[tauri::command]
pub async fn automation_record_start(app: AppHandle) -> Result<RecordingSession, String> {
    let recorder = global_recorder();
    if !recorder.is_recording() {
        let confirmed = RECORDING_DECISIONS
            .confirm(&app, START_RECORDING_REQUEST, start_recording_question())
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(RECORDING_DECLINED_MESSAGE.to_string());
        }
    }
    let _ = recorder.set_app_handle(app);
    let session = recorder.start_recording().map_err(|e| e.to_string())?;
    *confirmed_recording() = ConfirmedRecording {
        session_id: Some(session.session_id.clone()),
        recording_id: None,
    };
    Ok(session)
}

/// Stops the session the user confirmed and hands its recording back. A
/// session that was not started through that yes is discarded instead.
#[tauri::command]
pub fn automation_record_stop() -> Result<Recording, String> {
    let recorder = global_recorder();
    if let Some(running) = recorder.get_status() {
        let confirmed = confirmed_recording().session_id.clone();
        if !is_the_confirmed_one(confirmed.as_deref(), &running.session_id) {
            let _ = recorder.discard_recording();
            return Err(RECORDING_NOT_CONFIRMED_MESSAGE.to_string());
        }
    }
    let recording = recorder.stop_recording().map_err(|e| e.to_string())?;
    confirmed_recording().recording_id = Some(recording.id.clone());
    Ok(recording)
}

#[tauri::command]
pub fn automation_record_discard() -> Result<DiscardedRecording, String> {
    global_recorder()
        .discard_recording()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn automation_record_action_click(x: i32, y: i32, button: String) -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder
            .record_click(x, y, &button)
            .map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_action_narration(text: String) -> Result<(), String> {
    let recorder = global_recorder();
    if recorder.is_recording() {
        recorder.record_narration(&text).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn automation_record_is_recording() -> Result<bool, String> {
    let recorder = global_recorder();
    Ok(recorder.is_recording())
}

#[tauri::command]
pub fn automation_record_get_status() -> Result<Option<RecordingStatus>, String> {
    Ok(global_recorder().get_status())
}

/// The last recording, when it is the one the user's yes produced.
#[tauri::command]
pub fn automation_record_get_last() -> Result<Option<Recording>, String> {
    let confirmed = confirmed_recording().recording_id.clone();
    Ok(global_recorder()
        .get_last_recording()
        .filter(|recording| is_the_confirmed_one(confirmed.as_deref(), &recording.id)))
}

#[tauri::command]
pub fn automation_record_clear_last() -> Result<(), String> {
    global_recorder()
        .clear_last_recording()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_start_recording_button_is_one_the_native_dialog_can_ask_with() {
        assert!(crate::sys::native_confirm::can_ask_with(
            START_RECORDING_CONFIRM_LABEL
        ));
        let question = start_recording_question();
        assert_eq!(question.confirm_label, START_RECORDING_CONFIRM_LABEL);
        assert!(question.body.contains("passwords included"));
    }

    #[test]
    fn only_the_session_and_recording_the_user_confirmed_are_handed_back() {
        assert!(is_the_confirmed_one(Some("session-1"), "session-1"));
        assert!(!is_the_confirmed_one(Some("session-1"), "session-2"));
        assert!(!is_the_confirmed_one(None, "session-1"));
    }

    fn body_of<'a>(source: &'a str, signature: &str) -> &'a str {
        source
            .split(signature)
            .nth(1)
            .and_then(|rest| rest.split("\n}\n").next())
            .unwrap_or_else(|| panic!("{signature} is missing"))
    }

    /// A recording starts only after the user's own yes, and a stop or a
    /// read-back checks that yes before it returns what was typed.
    #[test]
    fn a_recording_is_confirmed_before_it_starts_and_before_it_is_handed_back() {
        let source = include_str!("automation_enhanced.rs");

        let start = body_of(source, "pub async fn automation_record_start(");
        assert!(
            start.find("RECORDING_DECISIONS").expect("asks")
                < start.find(".start_recording()").expect("starts")
        );
        let stop = body_of(source, "pub fn automation_record_stop(");
        assert!(
            stop.find("is_the_confirmed_one(").expect("checks")
                < stop.find(".stop_recording()").expect("stops")
        );
        let last = body_of(source, "pub fn automation_record_get_last(");
        assert!(last.contains("is_the_confirmed_one("));
    }
}
