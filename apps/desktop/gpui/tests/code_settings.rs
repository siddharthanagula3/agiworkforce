use agiworkforce_desktop_gpui::code_settings::CodeSettings;
use agiworkforce_protocol::{developer_session::SettingsReadResponse, instruction_settings::*};

fn snapshot() -> InstructionSettingsSnapshot {
    InstructionSettingsSnapshot {
        root_key: "root".into(),
        scope: InstructionSettingsScope::Project,
        path: "/workspace/.agiworkforce/instructions.md".into(),
        revision: Some("first".into()),
        text: "stored text".into(),
        profile: SettingsReadResponse {
            default_model: None,
            default_effort: None,
            permission_mode: None,
            user_instructions: None,
            project_instructions: None,
            user_instructions_path: "/profile/instructions.md".into(),
            project_instructions_path: "/workspace/.agiworkforce/instructions.md".into(),
            config_path: "/profile/config.toml".into(),
        },
    }
}
fn params() -> InstructionSettingsReadParams {
    InstructionSettingsReadParams {
        root_key: "root".into(),
        scope: InstructionSettingsScope::Project,
    }
}
fn settings() -> CodeSettings {
    let mut state = CodeSettings::default();
    state.replace(&params(), snapshot()).unwrap();
    state
}

#[test]
fn invalid_scope_path_or_text_cannot_replace_the_confirmed_form() {
    let mut state = settings();
    let before = state.snapshot.clone();
    for field in ["root", "scope", "path", "revision", "text", "profile"] {
        let mut bad = snapshot();
        match field {
            "root" => bad.root_key = "foreign".into(),
            "scope" => bad.scope = InstructionSettingsScope::User,
            "path" => bad.path = "/different-file".into(),
            "revision" => bad.revision = None,
            "text" => bad.text = "bad\0content".into(),
            _ => bad.profile.user_instructions = Some("unreviewed data".into()),
        }
        assert!(state.replace(&params(), bad).is_err(), "{field}");
        assert_eq!(state.snapshot, before);
    }
}

#[test]
fn write_requests_capture_the_exact_scope_revision_and_utf8_text() {
    let state = settings();
    let request = state.write_params("my 東京 edits 🦀".into()).unwrap();
    assert_eq!(request.root_key, "root");
    assert_eq!(request.scope, InstructionSettingsScope::Project);
    assert_eq!(request.revision.as_deref(), Some("first"));
    assert_eq!(request.text, "my 東京 edits 🦀");
    assert!(state
        .write_params("x".repeat(MAX_INSTRUCTION_EDIT_BYTES + 1))
        .is_err());
}

#[test]
fn stale_stored_text_becomes_a_conflict_without_discarding_edits() {
    let mut state = settings();
    let mut changed = snapshot();
    changed.revision = Some("new".into());
    changed.text = "external edit".into();
    assert_eq!(
        state
            .refresh(&params(), changed.clone(), "my edits")
            .unwrap(),
        None
    );
    assert_eq!(state.conflict, Some(changed.clone()));
    assert!(state.write_params("my edits".into()).is_err());
    state.keep_edits().unwrap();
    assert!(state.dirty("my edits"));
    assert_eq!(
        state.write_params("my edits".into()).unwrap().revision,
        changed.revision
    );
}

#[test]
fn an_unknown_save_is_reconciled_by_reading_the_accepted_text() {
    let mut state = settings();
    state.error = Some("unknown acceptance".into());
    assert!(state.write_params("accepted".into()).is_err());
    let mut accepted = snapshot();
    accepted.revision = Some("accepted-revision".into());
    accepted.text = "accepted".into();
    assert_eq!(
        state
            .refresh(&params(), accepted, "accepted")
            .unwrap()
            .as_deref(),
        Some("accepted")
    );
    assert!(!state.dirty("accepted"));
    assert!(state.error.is_none());
}

#[test]
fn a_save_acknowledgement_does_not_claim_newer_typing_was_saved() {
    let mut state = settings();
    let request = state.write_params("submitted".into()).unwrap();
    let mut accepted = snapshot();
    accepted.revision = Some("saved".into());
    accepted.text = "submitted".into();
    state
        .finish(
            &request,
            InstructionSettingsWriteResponse {
                saved: true,
                current: accepted,
            },
        )
        .unwrap();
    assert!(!state.dirty("submitted"));
    assert!(state.dirty("typed later"));
}

#[test]
fn mismatched_acknowledgements_do_not_advance_the_saved_baseline() {
    let mut state = settings();
    let before = state.snapshot.clone();
    let request = state.write_params("submitted".into()).unwrap();
    let mut wrong = snapshot();
    wrong.text = "not submitted".into();
    assert!(state
        .finish(
            &request,
            InstructionSettingsWriteResponse {
                saved: true,
                current: wrong
            }
        )
        .is_err());
    assert_eq!(state.snapshot, before);
    let mut foreign = snapshot();
    foreign.root_key = "different-root".into();
    assert!(state
        .finish(
            &request,
            InstructionSettingsWriteResponse {
                saved: false,
                current: foreign
            }
        )
        .is_err());
    assert!(state.conflict.is_none());
}
